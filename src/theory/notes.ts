/**
 * notes.ts — 音高表示与音名拼写
 *
 * 设计要点：
 * 1. pitch class 用 0-11，C = 0。
 * 2. 绝对音高用 MIDI number（C4 = 60，吉他 6 弦空弦 = E2 = 40）。
 * 3. **不使用「12 个固定音名」查表**，而是按「字母 + 变音记号」推导拼写。
 *    查表法的致命问题：F 大调的第 4 级会被拼成 A#，正确写法是 Bb。
 *    音名的本质是「音级（字母） + 变音记号（升降号）」，必须分开算。
 */

/** 七个音级字母 */
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
export type Letter = (typeof LETTERS)[number]

/** 每个字母的自然音高（pitch class） */
export const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const

/** 反向：pitch class → 自然音级字母下标（只对 7 个自然音有效） */
const NATURAL_PC_TO_LETTER: Record<number, number> = {
  0: 0,
  2: 1,
  4: 2,
  5: 3,
  7: 4,
  9: 5,
  11: 6,
}

/** 降号键位下的默认拼写（用于无调性上下文的兜底显示） */
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const
/** 升号键位下的默认拼写 */
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** 归一化到 0-11 */
export function pc(midi: number): number {
  return ((midi % 12) + 12) % 12
}

/** MIDI → 频率（A4 = 69 = 440Hz） */
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/** MIDI → 八度号（科学音高记号法，C4 = 中央 C） */
export function midiToOctave(midi: number): number {
  return Math.floor(midi / 12) - 1
}

/**
 * 变音记号数量 → 符号字符串
 * -2 → 'bb'，-1 → 'b'，0 → ''，1 → '#'，2 → '##'
 */
function accidentalMark(acc: number): string {
  if (acc === 0) return ''
  if (acc > 0) return '#'.repeat(acc)
  return 'b'.repeat(-acc)
}

/**
 * 把差值归一化到最短变音记号（-2..+2）。
 * 三全音（差值 6）理论上无法用单个字母表示，取更常用的一侧。
 */
function normalizeAccidental(diff: number): { acc: number; exact: boolean } {
  let d = ((diff % 12) + 12) % 12
  if (d > 6) d -= 12
  const exact = Math.abs(d) <= 2
  if (d === 6) d = -6 + 12 // 不应发生
  return { acc: d, exact }
}

/**
 * 用指定的音级字母去拼写一个 pitch class。
 *
 * 例：spellWithLetter(10, 6 /* B *\/) === 'Bb'   （F 大调第 4 级）
 *     spellWithLetter(10, 5 /* A *\/) === 'A#'   （同一个音，但在 Bb 大调里不该这么写）
 */
export function spellWithLetter(targetPc: number, letterIdx: number): string {
  const natural = LETTER_PC[((letterIdx % 7) + 7) % 7]
  const { acc } = normalizeAccidental(targetPc - natural)
  if (Math.abs(acc) > 2) {
    // 退化情形：字母与音高差距过大，退回默认拼写
    return SHARP_NAMES[targetPc]
  }
  return LETTERS[((letterIdx % 7) + 7) % 7] + accidentalMark(acc)
}

/**
 * 解析音名 → { pc, letterIdx }
 * 支持 C D E F G A B + # / b / x / ## / bb / ♯ / ♭
 */
export function parseNoteName(input: string): { pc: number; letterIdx: number } | null {
  const s = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  const m = /^([A-Ga-g])([#bx♯♭]*)$/.exec(s)
  if (!m) return null
  const letterIdx = LETTERS.indexOf(m[1].toUpperCase() as Letter)
  let acc = 0
  for (const ch of m[2]) {
    if (ch === '#') acc += 1
    else if (ch === 'b') acc -= 1
    else if (ch === 'x') acc += 2
  }
  return { pc: (((LETTER_PC[letterIdx] + acc) % 12) + 12) % 12, letterIdx }
}

/** 调式/和弦根音的默认拼写（用于下拉选项等无音级上下文的场合） */
export function defaultSpell(targetPc: number, preferFlat: boolean): string {
  return preferFlat ? FLAT_NAMES[targetPc] : SHARP_NAMES[targetPc]
}

/** 判断一个调的主音更常用升号还是降号记谱 */
export function preferFlatForKey(tonicPc: number, tonicLetterIdx: number): boolean {
  // F / Bb / Eb / Ab / Db 系用降号；G / D / A / E / B / F# 系用升号
  const flatKeys = [5, 10, 3, 8, 1, 6] // F, Bb, Eb, Ab, Db, Gb
  if (flatKeys.includes(tonicPc)) return true
  const sharpKeys = [7, 2, 9, 4, 11, 6] // G, D, A, E, B, F#
  if (sharpKeys.includes(tonicPc)) return false
  // C 大调 → 自然音级字母为 0/2/4/5/7/9/11，无升降
  return letterHasFlatBias(tonicLetterIdx)
}

function letterHasFlatBias(letterIdx: number): boolean {
  return letterIdx === 3 || letterIdx === 6 || letterIdx === 1 // F, B, D 倾向降号
}

/** 自然音的自然拼写（无升降号的那些音） */
export function naturalName(targetPc: number): string {
  const idx = NATURAL_PC_TO_LETTER[targetPc]
  return idx === undefined ? SHARP_NAMES[targetPc] : LETTERS[idx]
}

/** 全 12 个音级下标的常用显示名（升号侧），用于「所有调」选择器 */
export const KEY_CHOICES: { pc: number; letterIdx: number; name: string }[] = [
  { pc: 0, letterIdx: 0, name: 'C' },
  { pc: 1, letterIdx: 1, name: 'Db' },
  { pc: 2, letterIdx: 1, name: 'D' },
  { pc: 3, letterIdx: 2, name: 'Eb' },
  { pc: 4, letterIdx: 2, name: 'E' },
  { pc: 5, letterIdx: 3, name: 'F' },
  { pc: 6, letterIdx: 3, name: 'F#' },
  { pc: 7, letterIdx: 4, name: 'G' },
  { pc: 8, letterIdx: 5, name: 'Ab' },
  { pc: 9, letterIdx: 5, name: 'A' },
  { pc: 10, letterIdx: 6, name: 'Bb' },
  { pc: 11, letterIdx: 6, name: 'B' },
]
