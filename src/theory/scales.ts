/**
 * scales.ts — 音阶建模与生成
 *
 * 设计要点：
 * 音阶定义为 { intervals, degrees }，**字母步进（letterStep）从 degree 标签里的数字推导**，
 * 而不是手写。这样做的原因是布鲁斯音阶这类「同一个字母对应两个音」的音阶能正确拼写：
 *
 *   C 布鲁斯 = ['1','b3','4','b5','5','b7']，intervals = [0,3,5,6,7,10]
 *   b5 的音级号是 5 → 字母步进 4 → 字母 G（自然音高 7）→ 目标音高 6 → 差 -1 → 'Gb'
 *   结果：C Eb F Gb G Bb   ✅
 *
 *   如果按「自由选字母」或「查 12 音名表」来拼，b5 会被写成 F#（同一个音，但乐理上错误，
 *   因为它不是 4 级 F 的升号，而是 5 级 G 的降号）。
 */

import { LETTER_PC, LETTERS, spellWithLetter } from './notes'

export type ScaleCategory = 'church' | 'minor' | 'pentatonic' | 'blues' | 'symmetric' | 'exotic'

export interface ScaleDef {
  id: string
  name: string
  nameEn: string
  /** 相对主音的半音数，升序，首个元素必须是 0 */
  intervals: number[]
  /** 音级标签，长度必须与 intervals 一致 */
  degrees: string[]
  category: ScaleCategory
  /** 一句话说明这个音阶的听感 / 用法 */
  desc: string
}

export const SCALE_CATEGORY_LABEL: Record<ScaleCategory, string> = {
  church: '教会调式',
  minor: '小调体系',
  pentatonic: '五声音阶',
  blues: '布鲁斯',
  symmetric: '对称音阶',
  exotic: '异域色彩',
}

export const SCALES: ScaleDef[] = [
  // ── 教会调式（大调的七种调式）──────────────────────────────
  {
    id: 'ionian',
    name: '伊奥尼亚',
    nameEn: 'Ionian',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    degrees: ['1', '2', '3', '4', '5', '6', '7'],
    category: 'church',
    desc: '就是自然大调，明亮、稳定，流行与摇滚的默认语言。',
  },
  {
    id: 'dorian',
    name: '多利亚',
    nameEn: 'Dorian',
    intervals: [0, 2, 3, 5, 7, 9, 10],
    degrees: ['1', '2', 'b3', '4', '5', '6', 'b7'],
    category: 'church',
    desc: '小调底色但带大六度，忧郁中透亮，Funk / 融合爵士常用。',
  },
  {
    id: 'phrygian',
    name: '弗里吉亚',
    nameEn: 'Phrygian',
    intervals: [0, 1, 3, 5, 7, 8, 10],
    degrees: ['1', 'b2', 'b3', '4', '5', 'b6', 'b7'],
    category: 'church',
    desc: 'b2 带来强烈的西班牙/金属压迫感，是重型的常客。',
  },
  {
    id: 'lydian',
    name: '利底亚',
    nameEn: 'Lydian',
    intervals: [0, 2, 4, 6, 7, 9, 11],
    degrees: ['1', '2', '3', '#4', '5', '6', '7'],
    category: 'church',
    desc: '大调加上 #4，飘浮、梦幻，电影配乐与 Dream Pop 首选。',
  },
  {
    id: 'mixolydian',
    name: '混合利底亚',
    nameEn: 'Mixolydian',
    intervals: [0, 2, 4, 5, 7, 9, 10],
    degrees: ['1', '2', '3', '4', '5', '6', 'b7'],
    category: 'church',
    desc: '大调加 b7，属和弦的天然搭档，Blues Rock 与 Funk 主力。',
  },
  {
    id: 'aeolian',
    name: '伊奥利亚',
    nameEn: 'Aeolian',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', 'b7'],
    category: 'church',
    desc: '自然小调，摇滚与流行的悲情底色。',
  },
  {
    id: 'locrian',
    name: '洛克里亚',
    nameEn: 'Locrian',
    intervals: [0, 1, 3, 5, 6, 8, 10],
    degrees: ['1', 'b2', 'b3', '4', 'b5', 'b6', 'b7'],
    category: 'church',
    desc: '唯一以减五度起家的调式，极不稳定，配 m7b5 使用。',
  },

  // ── 小调体系 ────────────────────────────────────────────
  {
    id: 'harmonic-minor',
    name: '和声小调',
    nameEn: 'Harmonic Minor',
    intervals: [0, 2, 3, 5, 7, 8, 11],
    degrees: ['1', '2', 'b3', '4', '5', 'b6', '7'],
    category: 'minor',
    desc: '自然小调把 b7 还原成 7，制造增二度，新古典金属的核心。',
  },
  {
    id: 'melodic-minor',
    name: '旋律小调',
    nameEn: 'Melodic Minor',
    intervals: [0, 2, 3, 5, 7, 9, 11],
    degrees: ['1', '2', 'b3', '4', '5', '6', '7'],
    category: 'minor',
    desc: '爵士旋律小调，小调底色配大调上方结构，即兴的高级素材。',
  },
  {
    id: 'phrygian-dominant',
    name: '弗里吉亚属',
    nameEn: 'Phrygian Dominant',
    intervals: [0, 1, 4, 5, 7, 8, 10],
    degrees: ['1', 'b2', '3', '4', '5', 'b6', 'b7'],
    category: 'exotic',
    desc: '和声小调第 5 调式，弗拉门戈与金属独奏的「异域音」。',
  },
  {
    id: 'lydian-dominant',
    name: '利底亚属',
    nameEn: 'Lydian Dominant',
    intervals: [0, 2, 4, 6, 7, 9, 10],
    degrees: ['1', '2', '3', '#4', '5', '6', 'b7'],
    category: 'exotic',
    desc: '属七和弦加 #11，解决感强又悬疑，爵士常用替代音阶。',
  },
  {
    id: 'altered',
    name: '变化音阶',
    nameEn: 'Altered',
    intervals: [0, 1, 3, 4, 6, 8, 10],
    degrees: ['1', 'b2', '#2', '3', 'b5', '#5', 'b7'],
    category: 'exotic',
    desc: '旋律小调第 7 调式，把属和弦的每个音都改到最紧张。',
  },

  // ── 五声 / 布鲁斯 ───────────────────────────────────────
  {
    id: 'major-pentatonic',
    name: '大调五声',
    nameEn: 'Major Pentatonic',
    intervals: [0, 2, 4, 7, 9],
    degrees: ['1', '2', '3', '5', '6'],
    category: 'pentatonic',
    desc: '去掉大调里最容易冲突的 4 和 7，怎么弹都不会错。',
  },
  {
    id: 'minor-pentatonic',
    name: '小调五声',
    nameEn: 'Minor Pentatonic',
    intervals: [0, 3, 5, 7, 10],
    degrees: ['1', 'b3', '4', '5', 'b7'],
    category: 'pentatonic',
    desc: '电吉他最重要的音阶，摇滚 Solo 的起点。',
  },
  {
    id: 'major-blues',
    name: '大调布鲁斯',
    nameEn: 'Major Blues',
    intervals: [0, 2, 3, 4, 7, 9],
    degrees: ['1', '2', 'b3', '3', '5', '6'],
    category: 'blues',
    desc: '大调五声加 b3 蓝调音，乡村与南方摇滚的味道。',
  },
  {
    id: 'minor-blues',
    name: '小调布鲁斯',
    nameEn: 'Minor Blues',
    intervals: [0, 3, 5, 6, 7, 10],
    degrees: ['1', 'b3', '4', 'b5', '5', 'b7'],
    category: 'blues',
    desc: '小调五声加 b5 经过音，Blues Rock 的招牌。',
  },

  // ── 对称音阶 ────────────────────────────────────────────
  {
    id: 'whole-tone',
    name: '全音阶',
    nameEn: 'Whole Tone',
    intervals: [0, 2, 4, 6, 8, 10],
    degrees: ['1', '2', '3', '#4', '#5', '#6'],
    category: 'symmetric',
    desc: '全部全音，无调性感，常用于 7#5 上的漂浮效果。',
  },
  {
    id: 'dim-wh',
    name: '减音阶（全半）',
    nameEn: 'Diminished (W-H)',
    intervals: [0, 2, 3, 5, 6, 8, 9, 11],
    degrees: ['1', '2', 'b3', '4', 'b5', 'b6', '6', '7'],
    category: 'symmetric',
    desc: '八个音，每三个半音一个循环，配减七和弦。',
  },
  {
    id: 'dim-hw',
    name: '减音阶（半全）',
    nameEn: 'Diminished (H-W)',
    intervals: [0, 1, 3, 4, 6, 7, 9, 10],
    degrees: ['1', 'b2', 'b3', '3', 'b5', '5', '6', 'b7'],
    category: 'symmetric',
    desc: '属七和弦的万能音阶，自带 b9 / #9 / #11 / 13 张力音。',
  },
]

export const SCALE_BY_ID: Record<string, ScaleDef> = Object.fromEntries(
  SCALES.map((s) => [s.id, s]),
)

/** 从 degree 标签推导字母步进：'b5' → 4（即主音字母往上第 4 个字母） */
export function degreeToLetterStep(degree: string): number {
  const n = parseInt(degree.replace(/[^0-9]/g, ''), 10)
  return (Number.isFinite(n) && n > 0 ? n : 1) - 1
}

export interface ScaleTone {
  /** pitch class 0-11 */
  pc: number
  /** 正确拼写的音名，如 'Gb' */
  name: string
  /** 音级标签，如 'b5' */
  degree: string
  /** 相对主音的半音数 */
  interval: number
  /** 音阶内序号（0 起） */
  index: number
  /** 音级字母下标 0-6 */
  letterIdx: number
}

/**
 * 生成音阶的所有音。
 * @param tonicPc       主音 pitch class
 * @param tonicLetterIdx 主音的音级字母下标（决定拼写，如 Bb 大调的主音字母是 B=6）
 */
export function buildScale(tonicPc: number, tonicLetterIdx: number, def: ScaleDef): ScaleTone[] {
  return def.intervals.map((interval, i) => {
    const letterStep = degreeToLetterStep(def.degrees[i])
    const letterIdx = (tonicLetterIdx + letterStep) % 7
    const targetPc = (((tonicPc + interval) % 12) + 12) % 12
    return {
      pc: targetPc,
      name: spellWithLetter(targetPc, letterIdx),
      degree: def.degrees[i],
      interval,
      index: i,
      letterIdx,
    }
  })
}

/** 音级标签 → 简谱式唱名，用于指板上更直观的显示 */
export function degreeToSolfege(degree: string): string {
  const map: Record<string, string> = {
    '1': 'do',
    '2': 're',
    '3': 'mi',
    '4': 'fa',
    '5': 'sol',
    '6': 'la',
    '7': 'si',
  }
  const n = degree.replace(/[^0-9]/g, '')
  const acc = degree.replace(/[0-9]/g, '')
  const base = map[n] ?? n
  return acc + base
}

/** 键位默认偏好：该音阶更适合升号还是降号记谱（仅用于兜底显示） */
export function scalePrefersFlat(def: ScaleDef): boolean {
  return def.degrees.some((d) => d.startsWith('b'))
}

export { LETTERS, LETTER_PC }
