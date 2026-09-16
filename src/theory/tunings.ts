/**
 * tunings.ts — 调弦与指板几何
 *
 * 约定：strings 数组按「最低音弦 → 最高音弦」排列，元素是 MIDI 音高。
 * 指板渲染时最低音弦画在最下方（标准指板图方向），弦号标签 6/5/4/3/2/1。
 */

import { defaultSpell, pc } from './notes'

export interface Tuning {
  id: string
  name: string
  /** MIDI，低音弦 → 高音弦 */
  strings: number[]
  kind: 'guitar' | 'bass'
  desc: string
}

export const TUNINGS: Tuning[] = [
  {
    id: 'standard-e',
    name: '标准调弦 E',
    strings: [40, 45, 50, 55, 59, 64], // E2 A2 D3 G3 B3 E4
    kind: 'guitar',
    desc: 'EADGBE，最通用',
  },
  {
    id: 'drop-d',
    name: 'Drop D',
    strings: [38, 45, 50, 55, 59, 64],
    kind: 'guitar',
    desc: '6 弦降全音，一根手指按出强力和弦',
  },
  {
    id: 'half-step-down',
    name: '降半音 Eb',
    strings: [39, 44, 49, 54, 58, 63],
    kind: 'guitar',
    desc: 'Eb Ab Db Gb Bb Eb，Hendrix / Slash 常用',
  },
  {
    id: 'full-step-down',
    name: '降全音 D',
    strings: [38, 43, 48, 53, 57, 62],
    kind: 'guitar',
    desc: 'DGCFAD，重型与降调人声友好',
  },
  {
    id: 'dadgad',
    name: 'DADGAD',
    strings: [38, 45, 50, 55, 57, 62],
    kind: 'guitar',
    desc: '凯尔特/指弹的挂留感调弦',
  },
  {
    id: 'open-g',
    name: 'Open G',
    strings: [38, 43, 50, 55, 59, 62],
    kind: 'guitar',
    desc: '空弦即 G 大三和弦，滑棒布鲁斯',
  },
  {
    id: 'seven-string',
    name: '七弦标准 B',
    strings: [35, 40, 45, 50, 55, 59, 64],
    kind: 'guitar',
    desc: 'BEADGBE，现代金属',
  },
  {
    id: 'bass-4',
    name: '贝斯四弦',
    strings: [28, 33, 38, 43], // E1 A1 D2 G2
    kind: 'bass',
    desc: 'EADG',
  },
]

export const TUNING_BY_ID: Record<string, Tuning> = Object.fromEntries(
  TUNINGS.map((t) => [t.id, t]),
)

/** 某根弦某品的音高（MIDI） */
export function noteAt(tuning: Tuning, stringIdx: number, fret: number): number {
  return tuning.strings[stringIdx] + fret
}

/** 某根弦某品的 pitch class */
export function pcAt(tuning: Tuning, stringIdx: number, fret: number): number {
  return pc(noteAt(tuning, stringIdx, fret))
}

/** 弦号（从最高音弦数起为 1） */
export function stringLabel(tuning: Tuning, stringIdx: number): string {
  return String(tuning.strings.length - stringIdx)
}

/** 空弦音名 */
export function openStringName(tuning: Tuning, stringIdx: number, preferFlat: boolean): string {
  return defaultSpell(pc(tuning.strings[stringIdx]), preferFlat)
}

/** 指板上所有位置的音名（用于探索模式一次性预算） */
export interface FretPosition {
  stringIdx: number
  fret: number
  midi: number
  pc: number
}

export function buildFretboardPositions(
  tuning: Tuning,
  startFret: number,
  fretCount: number,
): FretPosition[] {
  const out: FretPosition[] = []
  for (let s = 0; s < tuning.strings.length; s++) {
    for (let f = startFret === 0 ? 0 : startFret; f < startFret + fretCount; f++) {
      const midi = noteAt(tuning, s, f)
      out.push({ stringIdx: s, fret: f, midi, pc: pc(midi) })
    }
  }
  return out
}

/** 品位标记（3/5/7/9/15/17/19/21 单点，12/24 双点） */
export function fretMarkers(startFret: number, fretCount: number): { fret: number; double: boolean }[] {
  const singles = [3, 5, 7, 9, 15, 17, 19, 21]
  const doubles = [12, 24]
  const out: { fret: number; double: boolean }[] = []
  for (let f = startFret === 0 ? 1 : startFret; f < startFret + fretCount; f++) {
    if (singles.includes(f)) out.push({ fret: f, double: false })
    else if (doubles.includes(f)) out.push({ fret: f, double: true })
  }
  return out
}
