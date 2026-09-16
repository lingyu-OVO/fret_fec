/**
 * voicings.ts — 和弦指型生成
 *
 * 问题：给定和弦名，找出指板上所有「按得出来」的指型。
 *
 * 朴素枚举是 25^6 ≈ 2.4 亿（6 根弦 × 0-24 品），必须剪枝。这里用四层剪枝：
 *
 *   ① 音高剪枝：只允许按在和弦音（含延伸音）上的品，其余品直接排除
 *   ② 锚点剪枝：枚举「最低按弦品位 anchor」，每根弦只允许 anchor..anchor+maxSpan，
 *      一次砍掉绝大部分组合（手只有 4-5 品跨度）
 *   ③ 跨度剪枝：DFS 过程中实时维护 minFret/maxFret，跨度超标立刻回溯
 *   ④ 可行性剪枝：剩余弦数 < 还缺的特征音数量 → 回溯；剩余弦数不够凑满最低发声弦数 → 回溯
 *      低音要求：一旦最低发声弦确定且要求根音在低音，不满足立刻回溯（这条剪枝效果最强）
 *
 * 终局校验：特征音齐全 / 发声弦数达标 / 低音要求 / 空弦使用合法
 * 去重：同一个 frets 数组只保留最高分
 */

import type { ChordDef } from './chords'
import { intervalToDegree, toMask } from './chords'
import { pc } from './notes'
import type { Tuning } from './tunings'

export interface VoicingOptions {
  /** 最高品（含） */
  maxFret: number
  /** 最大按弦跨度（品） */
  maxSpan: number
  /** 最少发声弦数 */
  minSounding: number
  /** 是否要求低音必须是根音 */
  requireRootInBass: boolean
  /** 是否允许空弦 */
  allowOpen: boolean
  /** 返回数量上限 */
  limit: number
}

export const DEFAULT_VOICING_OPTIONS: VoicingOptions = {
  maxFret: 15,
  maxSpan: 4,
  minSounding: 4,
  requireRootInBass: true,
  allowOpen: true,
  limit: 60,
}

export interface Voicing {
  /** 每根弦的品位，null = 闷音，0 = 空弦；顺序为低音弦 → 高音弦 */
  frets: (number | null)[]
  /** 最低按下的品位（0 表示全空弦） */
  minFret: number
  maxFret: number
  span: number
  /** 发声弦数 */
  sounding: number
  /** 闷掉的弦数 */
  muted: number
  /** 低音弦处连续闷音的数量 */
  bottomMutes: number
  /** 中间被闷掉的弦数（手指够不到的那种，听感最差） */
  innerMutes: number
  bassPc: number | null
  bassIsRoot: boolean
  /** 低音在和弦里的音程序号（用于显示转位） */
  inversion: number | null
  /** 每个发声弦对应的和弦音程，闷音为 null */
  intervals: (number | null)[]
  /** 每个发声弦的音级标签，闷音为 null */
  degrees: (string | null)[]
  /** 是否覆盖了全部和弦音 */
  complete: boolean
  score: number
  /** 建议在第几把位弹 */
  position: number
}

function popcount(n: number): number {
  let c = 0
  while (n) {
    n &= n - 1
    c++
  }
  return c
}

/**
 * 搜索和弦指型。
 *
 * @param def    和弦模板
 * @param rootPc 根音 pitch class
 * @param tuning 调弦
 */
export function findVoicings(
  def: ChordDef,
  rootPc: number,
  tuning: Tuning,
  options: Partial<VoicingOptions> = {},
): Voicing[] {
  const opts: VoicingOptions = { ...DEFAULT_VOICING_OPTIONS, ...options }
  const nStrings = tuning.strings.length

  const chordMask = toMask(def.intervals)
  const essMask = toMask(def.essential)
  const essCount = popcount(essMask)
  const maxSpan = Math.max(0, opts.maxSpan)

  // 每根弦在某品上的音程（相对根音）—— 注意是「相对音程」，不是绝对 pitch class
  const intervalAt = (s: number, f: number) => (pc(tuning.strings[s] + f) - rootPc + 12) % 12

  // 每根弦上「和弦音所在的品位」预计算。
  // ⚠️ 必须用 intervalAt 换算成相对音程再和 chordMask 比，直接比绝对 pc 只有在 C 根音时才对。
  const allowedByString: number[][] = []
  for (let s = 0; s < nStrings; s++) {
    const list: number[] = []
    for (let f = opts.allowOpen ? 0 : 1; f <= opts.maxFret; f++) {
      if (chordMask & (1 << intervalAt(s, f))) list.push(f)
    }
    allowedByString.push(list)
  }

  const bestByKey = new Map<string, Voicing>()

  const frets: (number | null)[] = new Array(nStrings).fill(null)

  function evaluate(): void {
    let sounding = 0
    let minF = Infinity
    let maxF = -Infinity
    let bassPc: number | null = null
    let interiorMask = 0
    const intervalsOut: (number | null)[] = new Array(nStrings).fill(null)

    for (let s = 0; s < nStrings; s++) {
      const f = frets[s]
      if (f === null) continue
      sounding++
      if (f > 0) {
        if (f < minF) minF = f
        if (f > maxF) maxF = f
      }
      const iv = intervalAt(s, f)
      intervalsOut[s] = iv
      interiorMask |= 1 << iv
      if (bassPc === null) bassPc = pc(tuning.strings[s] + f)
    }

    if (sounding < opts.minSounding) return
    if (sounding === 0) return

    // 特征音必须齐全
    if ((essMask & interiorMask) !== essMask) return

    const realMin = minF === Infinity ? 0 : minF
    const realMax = maxF === -Infinity ? 0 : maxF
    const span = realMax - realMin
    if (span > maxSpan) return

    const bassIsRoot = bassPc === rootPc
    if (opts.requireRootInBass && !bassIsRoot) return

    // 统计闷音
    let first = -1
    let last = -1
    for (let s = 0; s < nStrings; s++) {
      if (frets[s] !== null) {
        if (first === -1) first = s
        last = s
      }
    }
    const bottomMutes = first
    let innerMutes = 0
    for (let s = first; s <= last; s++) if (frets[s] === null) innerMutes++

    const complete = (chordMask & interiorMask) === chordMask
    const bassInterval = bassPc === null ? null : (bassPc - rootPc + 12) % 12
    const inversion =
      bassInterval === null || !def.intervals.includes(bassInterval)
        ? null
        : def.intervals.indexOf(bassInterval)

    // ── 打分：优先低把位、无闷音、音齐全、发声弦多 ──
    let score = 0
    score += bassIsRoot ? 50 : 0
    score += sounding * 6
    score -= innerMutes * 14
    score -= bottomMutes * 7
    score -= span * 4
    score -= realMin * 1.1
    score += complete ? 16 : 0
    score += popcount(interiorMask & essMask) === essCount ? 0 : -20
    // 空弦特别好按，给一点加成
    const openCount = frets.filter((f) => f === 0).length
    score += openCount * 2.5

    const degrees = intervalsOut.map((iv) => (iv === null ? null : intervalToDegree(iv, def.intervals)))

    const v: Voicing = {
      frets: [...frets],
      minFret: realMin,
      maxFret: realMax,
      span,
      sounding,
      muted: nStrings - sounding,
      bottomMutes,
      innerMutes,
      bassPc,
      bassIsRoot,
      inversion,
      intervals: intervalsOut,
      degrees,
      complete,
      score,
      position: realMin === 0 ? 1 : realMin,
    }

    const key = tabText(frets)
    const prev = bestByKey.get(key)
    if (!prev || v.score > prev.score) bestByKey.set(key, v)
  }

  function dfs(s: number, soundingSoFar: number, maskSoFar: number, minF: number, maxF: number, bassSoFar: number | null): void {
    // ④ 可行性剪枝
    const remainingStrings = nStrings - s
    const missingEss = popcount(essMask & ~maskSoFar)
    if (missingEss > remainingStrings) return
    if (soundingSoFar + remainingStrings < opts.minSounding) return
    if (opts.requireRootInBass && bassSoFar !== null && bassSoFar !== rootPc) return

    if (s >= nStrings) {
      evaluate()
      return
    }

    const anchor = currentAnchor
    const lo = anchor === 0 ? (opts.allowOpen ? 0 : 1) : anchor
    const hi = Math.min(anchor + maxSpan, opts.maxFret)

    // 选项 1：闷音
    frets[s] = null
    dfs(s + 1, soundingSoFar, maskSoFar, minF, maxF, bassSoFar)

    // 选项 2：该弦上落在 [lo, hi] 范围内的合法品位
    for (const f of allowedByString[s]) {
      if (f < lo || f > hi) continue
      const newMin = f > 0 ? Math.min(minF, f) : minF
      const newMax = f > 0 ? Math.max(maxF, f) : maxF
      if (newMax - newMin > maxSpan) continue
      const iv = intervalAt(s, f)
      const newBass = bassSoFar === null ? pc(tuning.strings[s] + f) : bassSoFar
      frets[s] = f
      dfs(s + 1, soundingSoFar + 1, maskSoFar | (1 << iv), newMin, newMax, newBass)
    }

    frets[s] = null
  }

  // ② 锚点：从 0（含空弦）到 maxFret
  let currentAnchor = 0
  for (let anchor = 0; anchor <= opts.maxFret; anchor++) {
    currentAnchor = anchor
    for (let s = 0; s < nStrings; s++) frets[s] = null
    dfs(0, 0, 0, Infinity, -Infinity, null)
  }

  const out = [...bestByKey.values()]
  out.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.minFret - b.minFret
  })

  return out.slice(0, opts.limit)
}

/** frets 数组 → 文本，如 'x32010'；两位数品位会补空格分隔以免歧义 */
function tabText(frets: (number | null)[]): string {
  return frets.map((f) => (f === null ? 'x' : String(f))).join(',')
}

/** 把一个指型格式化成文本，如 'x32010'（两位数品位前加空格） */
export function voicingToTabText(v: Voicing): string {
  return v.frets
    .map((f) => (f === null ? 'x' : f === 0 ? '0' : f > 9 ? ` ${f} ` : String(f)))
    .join('')
}

/** 把指型转成实际发声的音名列表 */
export function voicingToneNames(v: Voicing, spell: (p: number) => string, tuning: Tuning): string[] {
  const names: string[] = []
  v.frets.forEach((f, s) => {
    if (f === null) return
    names.push(spell(pc(tuning.strings[s] + f)))
  })
  return names
}

/** 常见开放和弦的经典按法（人工补录），用于「常用指型」优先展示 */
export interface ClassicShape {
  id: string
  /** 和弦模板 id */
  chordId: string
  /** 根音 pc */
  rootPc: number
  tuningId: string
  frets: (number | null)[]
  label: string
}

const OPEN_MAJOR: Record<number, (number | null)[]> = {
  0: [null, 3, 2, 0, 1, 0], // C
  2: [null, null, 0, 2, 3, 2], // D
  4: [0, 2, 2, 1, 0, 0], // E
  5: [1, 3, 3, 2, 1, 1], // F (大横按)
  7: [3, 2, 0, 0, 0, 3], // G
  9: [null, 0, 2, 2, 2, 0], // A
  11: [null, 2, 4, 4, 4, 2], // B (大横按)
}

const OPEN_MINOR: Record<number, (number | null)[]> = {
  0: [null, 3, 5, 5, 4, 3], // Cm
  2: [null, null, 0, 2, 3, 1], // Dm
  4: [0, 2, 2, 0, 0, 0], // Em
  5: [1, 3, 3, 1, 1, 1], // Fm
  7: [3, 5, 5, 3, 3, 3], // Gm
  9: [null, 0, 2, 2, 1, 0], // Am
  11: [null, 2, 4, 4, 3, 2], // Bm
}

const OPEN_SEVENTH: Record<number, (number | null)[]> = {
  0: [null, 3, 2, 3, 1, 0], // C7
  2: [null, null, 0, 2, 1, 2], // D7
  4: [0, 2, 0, 1, 0, 0], // E7
  5: [1, 3, 1, 2, 1, 1], // F7
  7: [3, 2, 0, 0, 0, 1], // G7
  9: [null, 0, 2, 0, 2, 0], // A7
  11: [null, 2, 1, 2, 0, 2], // B7
}

export const CLASSIC_SHAPES: ClassicShape[] = (() => {
  const out: ClassicShape[] = []
  const push = (table: Record<number, (number | null)[]>, chordId: string, label: string) => {
    for (const [r, frets] of Object.entries(table)) {
      out.push({
        id: `${chordId}-${r}`,
        chordId,
        rootPc: Number(r),
        tuningId: 'standard-e',
        frets,
        label,
      })
    }
  }
  push(OPEN_MAJOR, 'maj', '开放把位')
  push(OPEN_MINOR, 'min', '开放把位')
  push(OPEN_SEVENTH, '7', '开放把位')
  return out
})()

/** 查人工补录的经典按法 */
export function classicShapeFor(chordId: string, rootPc: number, tuningId: string): (number | null)[] | null {
  const hit = CLASSIC_SHAPES.find(
    (c) => c.chordId === chordId && c.rootPc === rootPc && c.tuningId === tuningId,
  )
  return hit ? hit.frets : null
}
