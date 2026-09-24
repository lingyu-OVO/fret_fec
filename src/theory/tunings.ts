/**
 * tunings.ts — 调弦与指板几何
 *
 * 约定：strings 数组按「最低音弦 → 最高音弦」排列，元素是 MIDI 音高。
 * 指板渲染时最低音弦画在最下方（标准指板图方向），弦号标签 6/5/4/3/2/1。
 */

import { defaultSpell, midiToOctave, pc } from './notes'

export interface Tuning {
  id: string
  name: string
  /** MIDI，低音弦 → 高音弦 */
  strings: number[]
  kind: 'guitar' | 'bass'
  desc: string
}

/**
 * 固定调弦表。
 *
 * ⚠️ 数组顺序决定下拉框里 optgroup 的顺序（分组按首次出现的位置排列），
 * 所以这里按「六弦吉他 → 七弦吉他 → 贝斯」成块排列，别随手打乱。
 */
export const TUNINGS: Tuning[] = [
  // ── 六弦吉他 ──
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
    strings: [38, 45, 50, 55, 59, 64], // D2 A2 D3 G3 B3 E4
    kind: 'guitar',
    desc: '6 弦降全音，一根手指按出强力和弦',
  },
  {
    id: 'drop-c',
    name: 'Drop C',
    strings: [36, 43, 48, 53, 57, 62], // C2 G2 C3 F3 A3 D4
    kind: 'guitar',
    desc: 'CGCFAD，Drop D 整体再降全音，重型常用',
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

  // ── 七弦吉他 ──
  {
    id: 'seven-string',
    name: '七弦标准 B',
    strings: [35, 40, 45, 50, 55, 59, 64], // B1 E2 A2 D3 G3 B3 E4
    kind: 'guitar',
    desc: 'BEADGBE，现代金属',
  },
  {
    id: 'seven-string-drop-a',
    name: '七弦 Drop A',
    strings: [33, 40, 45, 50, 55, 59, 64], // A1 E2 A2 D3 G3 B3 E4
    kind: 'guitar',
    desc: 'AEADGBE，七弦版 Drop，低音更沉',
  },

  // ── 贝斯 ──
  {
    id: 'bass-4',
    name: '贝斯四弦',
    strings: [28, 33, 38, 43], // E1 A1 D2 G2
    kind: 'bass',
    desc: 'EADG',
  },
  {
    id: 'bass-5',
    name: '贝斯五弦',
    strings: [23, 28, 33, 38, 43], // B0 E1 A1 D2 G2
    kind: 'bass',
    desc: 'BEADG，低音 B 弦下探到 B0',
  },
]

/** 下拉框分组名。由弦数和 kind 推导，避免每加一条调弦都要手填分组字段 */
export function tuningGroup(t: Tuning): string {
  if (t.kind === 'bass') return '贝斯'
  return t.strings.length >= 7 ? '七弦吉他' : '六弦吉他'
}

export const TUNING_BY_ID: Record<string, Tuning> = Object.fromEntries(
  TUNINGS.map((t) => [t.id, t]),
)

// ─────────────────────────────────────────────────────────
// 自由调弦（用户逐弦指定音高）
//
// 它不是 TUNINGS 里的一条固定记录，而是运行时按用户输入构造的对象，
// 所以用固定的 CUSTOM_TUNING_ID 作为身份标识，弦音高另外存一份数组。
// ─────────────────────────────────────────────────────────

/** 自由调弦的 id。注意它不在 TUNING_BY_ID 里，查不到时不要当成出错 */
export const CUSTOM_TUNING_ID = 'custom'

/** 调弦模式的两种取值 */
export type TuningMode = 'fixed' | 'free'

/** 自由调弦允许的弦数范围（覆盖四弦/五弦贝斯到七弦吉他） */
export const MIN_STRINGS = 4
export const MAX_STRINGS = 7

/** 单根弦可选音高的 MIDI 范围：E0(16) ~ E5(76)，覆盖贝斯低音弦到吉他高把位 */
export const MIN_STRING_MIDI = 16
export const MAX_STRING_MIDI = 76

/** MIDI → 带八度的音名，如 36 → "C2" */
export function midiNoteName(midi: number, preferFlat: boolean): string {
  return `${defaultSpell(pc(midi), preferFlat)}${midiToOctave(midi)}`
}

/** 把任意输入钳到合法的弦音高，并保证弦数在 4~7 之间 */
export function clampStrings(strings: number[]): number[] {
  return strings
    .slice(0, MAX_STRINGS)
    .map((m) => Math.min(MAX_STRING_MIDI, Math.max(MIN_STRING_MIDI, Math.round(m))))
}

/**
 * 构造自由调弦对象。
 *
 * 纯函数且对同一输入返回等价内容 —— 调用方请用 useMemo 包住，
 * 否则每次渲染都产生新对象，会把依赖 tuning 的和弦指型搜索整片打掉重算。
 */
export function makeCustomTuning(strings: number[], preferFlat = false): Tuning {
  const clean = clampStrings(strings)
  const pcs = clean.map((m) => defaultSpell(pc(m), preferFlat))
  return {
    id: CUSTOM_TUNING_ID,
    // 名字带上音名，右侧栏页脚「当前：…」才有信息量，否则只显示「自由调弦」看不出调了什么
    name: `自由调弦 ${pcs.join(' ')}`,
    strings: clean,
    // 自定义调弦不进固定调弦的分组下拉框，kind 只被 tuningGroup 使用，这里取值无实际影响
    kind: 'guitar',
    desc: `${clean.length} 弦 · ${clean.map((m) => midiNoteName(m, preferFlat)).join(' ')}`,
  }
}

/** 自由调弦「从当前固定调弦复制一份」用：把字符串数组拷成可变副本 */
export function stringsOf(t: Tuning): number[] {
  return [...t.strings]
}

/** 选弦器的候选音高，按八度分组方便在长列表里定位 */
export function stringPitchOptions(
  preferFlat: boolean,
): { value: number; label: string; group: string }[] {
  const out: { value: number; label: string; group: string }[] = []
  for (let m = MIN_STRING_MIDI; m <= MAX_STRING_MIDI; m++) {
    out.push({
      value: m,
      label: midiNoteName(m, preferFlat),
      group: `八度 ${midiToOctave(m)}`,
    })
  }
  return out
}

/**
 * 改变弦数时尽量保留已设定的音高。
 *
 * 增加弦时在**最低音侧**补一根低四度的弦 —— 这不是随便定的：
 *   六弦 EADGBE [40…64] → 补出 35(B1)，正好是七弦吉他的低音 B 弦；
 *   四弦贝斯 [28…43]    → 补出 23(B0)，正好是五弦贝斯的低音 B 弦。
 * 真实乐器的扩展方式就是这样，所以这个默认值能直接对上。
 */
export function resizeStrings(cur: number[], n: number): number[] {
  const target = Math.max(MIN_STRINGS, Math.min(MAX_STRINGS, n))
  // slice(-target) 保留**最高**的 target 根 —— 必须和下面「在低音侧补弦」对称：
  // 七弦 BEADGBE 减到六弦要退回 EADGBE，而不是砍掉高音 E 变成 BEADGB。
  const next = clampStrings(cur).slice(-target)
  while (next.length < target) {
    const first = next[0] ?? 40
    next.unshift(Math.max(MIN_STRING_MIDI, first - 5))
  }
  return next
}

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
