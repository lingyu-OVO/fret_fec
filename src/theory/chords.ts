/**
 * chords.ts — 和弦公式库 + 和弦识别
 *
 * 识别为什么不能做「精确匹配」：
 * 真实演奏里的和弦是「省略 + 加音」的。吉他手弹 Cmaj7 常常是 x32000（省五音），
 * 弹 C9 常常省五音、甚至省根音。精确匹配会让绝大多数真实按法识别失败。
 *
 * 所以这里用「特征音（essential）+ 评分排序」：
 *   1. 缺任何一个特征音 → 直接否决该模板（特征音是定义这个和弦之所以是它的音）
 *   2. 其它音（五音、延伸音）缺失 → 扣分但不否决
 *   3. 多出来的音（不在模板内）→ 重罚，因为多出来的音通常意味着另一个和弦
 *   4. 低音决定读法 → {C,E,G,A} 低音是 A 读 Am7，低音是 C 读 C6
 */

import { KEY_CHOICES, pc, spellWithLetter } from './notes'

// ────────────────────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────────────────────

export type ChordCategory = 'triad' | 'suspended' | 'sixth' | 'seventh' | 'added' | 'extended' | 'altered'

export interface ChordDef {
  id: string
  /** 和弦符号后缀，大三和弦为空串 */
  suffix: string
  /** 其它常见写法，用于解析用户输入与结果展示 */
  aliases?: string[]
  nameZh: string
  category: ChordCategory
  /** 模板包含的全部音程（相对根音的半音数） */
  intervals: number[]
  /** 特征音：缺一不可 */
  essential: number[]
  /** 常用度 0-100，越高越优先被识别 */
  priority: number
}

const CATEGORY_LABEL: Record<ChordCategory, string> = {
  triad: '三和弦',
  suspended: '挂留和弦',
  sixth: '六和弦',
  seventh: '七和弦',
  added: '加音和弦',
  extended: '延伸和弦',
  altered: '变化和弦',
}

export const CHORD_CATEGORY_LABEL = CATEGORY_LABEL

// ────────────────────────────────────────────────────────────
// 和弦库
// ────────────────────────────────────────────────────────────

export const CHORDS: ChordDef[] = [
  // ── 三和弦 ────────────────────────────────────────────────
  { id: 'maj', suffix: '', aliases: ['M', 'maj', 'major'], nameZh: '大三和弦', category: 'triad', intervals: [0, 4, 7], essential: [0, 4], priority: 100 },
  { id: 'min', suffix: 'm', aliases: ['min', '-'], nameZh: '小三和弦', category: 'triad', intervals: [0, 3, 7], essential: [0, 3], priority: 98 },
  { id: 'dim', suffix: 'dim', aliases: ['°', 'o'], nameZh: '减三和弦', category: 'triad', intervals: [0, 3, 6], essential: [0, 3, 6], priority: 74 },
  { id: 'aug', suffix: 'aug', aliases: ['+', '#5'], nameZh: '增三和弦', category: 'triad', intervals: [0, 4, 8], essential: [0, 4, 8], priority: 62 },
  { id: 'five', suffix: '5', aliases: ['power'], nameZh: '强力和弦', category: 'triad', intervals: [0, 7], essential: [0, 7], priority: 68 },

  // ── 挂留和弦 ──────────────────────────────────────────────
  { id: 'sus2', suffix: 'sus2', nameZh: '挂二和弦', category: 'suspended', intervals: [0, 2, 7], essential: [0, 2, 7], priority: 70 },
  { id: 'sus4', suffix: 'sus4', aliases: ['sus'], nameZh: '挂四和弦', category: 'suspended', intervals: [0, 5, 7], essential: [0, 5, 7], priority: 76 },
  { id: '7sus4', suffix: '7sus4', aliases: ['7sus'], nameZh: '属七挂四', category: 'suspended', intervals: [0, 5, 7, 10], essential: [0, 5, 10], priority: 66 },

  // ── 六和弦 ────────────────────────────────────────────────
  { id: '6', suffix: '6', aliases: ['M6', 'maj6'], nameZh: '大六和弦', category: 'sixth', intervals: [0, 4, 7, 9], essential: [0, 4, 9], priority: 74 },
  { id: 'm6', suffix: 'm6', aliases: ['min6'], nameZh: '小六和弦', category: 'sixth', intervals: [0, 3, 7, 9], essential: [0, 3, 9], priority: 70 },
  { id: '69', suffix: '6/9', aliases: ['69', '6add9'], nameZh: '六九和弦', category: 'sixth', intervals: [0, 2, 4, 7, 9], essential: [0, 2, 4, 9], priority: 60 },

  // ── 七和弦 ────────────────────────────────────────────────
  { id: '7', suffix: '7', aliases: ['dom7'], nameZh: '属七和弦', category: 'seventh', intervals: [0, 4, 7, 10], essential: [0, 4, 10], priority: 96 },
  { id: 'maj7', suffix: 'maj7', aliases: ['Δ', 'Δ7', 'M7', 'ma7'], nameZh: '大七和弦', category: 'seventh', intervals: [0, 4, 7, 11], essential: [0, 4, 11], priority: 93 },
  { id: 'm7', suffix: 'm7', aliases: ['min7', '-7'], nameZh: '小七和弦', category: 'seventh', intervals: [0, 3, 7, 10], essential: [0, 3, 10], priority: 95 },
  { id: 'm7b5', suffix: 'm7b5', aliases: ['ø', 'ø7', 'm7-5', 'half-dim'], nameZh: '半减七和弦', category: 'seventh', intervals: [0, 3, 6, 10], essential: [0, 3, 6, 10], priority: 78 },
  { id: 'dim7', suffix: 'dim7', aliases: ['°7', 'o7'], nameZh: '减七和弦', category: 'seventh', intervals: [0, 3, 6, 9], essential: [0, 3, 6, 9], priority: 73 },
  { id: 'mMaj7', suffix: 'mMaj7', aliases: ['mM7', 'minMaj7', '-Δ7'], nameZh: '小大七和弦', category: 'seventh', intervals: [0, 3, 7, 11], essential: [0, 3, 11], priority: 56 },
  { id: 'aug7', suffix: '7#5', aliases: ['aug7', '7b13', '+7'], nameZh: '增属七和弦', category: 'seventh', intervals: [0, 4, 8, 10], essential: [0, 4, 8, 10], priority: 60 },
  { id: 'augMaj7', suffix: 'maj7#5', aliases: ['augMaj7', 'M7#5', '+M7'], nameZh: '增大七和弦', category: 'seventh', intervals: [0, 4, 8, 11], essential: [0, 4, 8, 11], priority: 46 },
  { id: '7b5', suffix: '7b5', aliases: ['7-5'], nameZh: '属七降五', category: 'seventh', intervals: [0, 4, 6, 10], essential: [0, 4, 6, 10], priority: 58 },

  // ── 加音和弦 ──────────────────────────────────────────────
  { id: 'add9', suffix: 'add9', aliases: ['add2', '2'], nameZh: '加九和弦', category: 'added', intervals: [0, 2, 4, 7], essential: [0, 2, 4], priority: 80 },
  { id: 'madd9', suffix: 'm(add9)', aliases: ['madd9', 'madd2'], nameZh: '小加九和弦', category: 'added', intervals: [0, 2, 3, 7], essential: [0, 2, 3], priority: 62 },

  // ── 延伸和弦 ──────────────────────────────────────────────
  { id: '9', suffix: '9', nameZh: '属九和弦', category: 'extended', intervals: [0, 2, 4, 7, 10], essential: [0, 2, 4, 10], priority: 82 },
  { id: 'maj9', suffix: 'maj9', aliases: ['Δ9', 'M9'], nameZh: '大九和弦', category: 'extended', intervals: [0, 2, 4, 7, 11], essential: [0, 2, 4, 11], priority: 76 },
  { id: 'm9', suffix: 'm9', aliases: ['min9', '-9'], nameZh: '小九和弦', category: 'extended', intervals: [0, 2, 3, 7, 10], essential: [0, 2, 3, 10], priority: 79 },
  { id: '11', suffix: '11', nameZh: '属十一和弦', category: 'extended', intervals: [0, 2, 4, 5, 7, 10], essential: [0, 5, 10], priority: 54 },
  { id: 'm11', suffix: 'm11', nameZh: '小十一和弦', category: 'extended', intervals: [0, 2, 3, 5, 7, 10], essential: [0, 3, 5, 10], priority: 50 },
  { id: '13', suffix: '13', nameZh: '属十三和弦', category: 'extended', intervals: [0, 2, 4, 7, 9, 10], essential: [0, 4, 9, 10], priority: 72 },
  { id: 'maj13', suffix: 'maj13', aliases: ['Δ13', 'M13'], nameZh: '大十三和弦', category: 'extended', intervals: [0, 2, 4, 7, 9, 11], essential: [0, 4, 9, 11], priority: 48 },
  { id: 'm13', suffix: 'm13', nameZh: '小十三和弦', category: 'extended', intervals: [0, 2, 3, 7, 9, 10], essential: [0, 3, 9, 10], priority: 49 },

  // ── 变化属和弦 ────────────────────────────────────────────
  { id: '7b9', suffix: '7b9', nameZh: '属七降九', category: 'altered', intervals: [0, 1, 4, 7, 10], essential: [0, 1, 4, 10], priority: 66 },
  { id: '7#9', suffix: '7#9', nameZh: '属七升九', category: 'altered', intervals: [0, 3, 4, 7, 10], essential: [0, 3, 4, 10], priority: 68 },
  { id: '7#11', suffix: '7#11', nameZh: '属七升十一', category: 'altered', intervals: [0, 4, 6, 7, 10], essential: [0, 4, 6, 10], priority: 56 },
  { id: '7b9b5', suffix: '7b9b5', aliases: ['7b5b9'], nameZh: '属七降九降五', category: 'altered', intervals: [0, 1, 4, 6, 10], essential: [0, 1, 4, 6, 10], priority: 44 },
]

export const CHORD_BY_ID: Record<string, ChordDef> = Object.fromEntries(CHORDS.map((c) => [c.id, c]))

// ────────────────────────────────────────────────────────────
// 工具
// ────────────────────────────────────────────────────────────

/** 音程集合 → 12 位掩码 */
export function toMask(intervals: number[]): number {
  let m = 0
  for (const i of intervals) m |= 1 << (((i % 12) + 12) % 12)
  return m
}

function popcount(n: number): number {
  let c = 0
  while (n) {
    n &= n - 1
    c++
  }
  return c
}

/** 音级默认拼写：吉他和弦符号里最常用的写法 */
export function spellRoot(targetPc: number, preferFlat = false): string {
  const entry = KEY_CHOICES.find((k) => k.pc === targetPc)!
  if (preferFlat && targetPc === 6) return 'Gb'
  return spellWithLetter(targetPc, entry.letterIdx)
}

/** 和弦音程 → 音级标签（'1' '3' 'b7' '9' …），会根据和弦本身消歧 */
export function intervalToDegree(interval: number, chordIntervals: number[]): string {
  const has = (i: number) => chordIntervals.includes(i)
  switch (((interval % 12) + 12) % 12) {
    case 0: return '1'
    case 1: return 'b9'
    case 2: return '9'
    case 3: return has(4) ? '#9' : 'b3'
    case 4: return '3'
    case 5: return '11'
    case 6: return has(7) ? '#11' : 'b5'
    case 7: return '5'
    case 8: return has(10) ? 'b13' : '#5'
    case 9: return has(10) ? '13' : '6'
    case 10: return 'b7'
    case 11: return '7'
    default: return String(interval)
  }
}

// ────────────────────────────────────────────────────────────
// 识别
// ────────────────────────────────────────────────────────────

export interface PlayedNote {
  pc: number
  /** 用于判断低音，没有就按点击顺序 */
  midi?: number
  stringIdx?: number
  fret?: number
}

export interface ChordCandidate {
  rootPc: number
  rootName: string
  def: ChordDef
  /** def.suffix 的快捷方式，UI 常用 */
  suffix: string
  /** 不含斜杠低音的和弦名，如 'Am7' */
  symbol: string
  /** 含斜杠低音的完整名，如 'Am7/G' */
  fullSymbol: string
  nameZh: string
  score: number
  /** 已奏出的模板音（相对根音） */
  matched: number[]
  /** 模板里有但没奏出的音 */
  missing: number[]
  /** 奏出了但不在模板里的音 */
  extra: number[]
  bassPc: number | null
  bassName: string | null
  bassIsRoot: boolean
  /** 转位序号：0 原位，1 第一转位…，null 表示低音不是和弦音 */
  inversion: number | null
  /** 是否完美匹配（不多不少） */
  perfect: boolean
}

export interface IdentifyResult {
  candidates: ChordCandidate[]
  /** 去重后的 pitch class 集合 */
  pcs: number[]
  bassPc: number | null
  /** 无法识别时的音程描述，如 '根音 + 小三度 + 纯五度' */
  fallbackDesc: string | null
}

const INTERVAL_NAME: Record<number, string> = {
  0: '纯一度', 1: '小二度', 2: '大二度', 3: '小三度', 4: '大三度', 5: '纯四度',
  6: '三全音', 7: '纯五度', 8: '小六度', 9: '大六度', 10: '小七度', 11: '大七度',
}

/**
 * 识别一组音构成的和弦。
 * @param played 已奏出的音（去重由内部处理）
 * @param opts.preferFlat 根音是否倾向降号拼写
 * @param opts.limit 返回候选数量上限
 */
export function identifyChord(
  played: PlayedNote[],
  opts: { preferFlat?: boolean; limit?: number } = {},
): IdentifyResult {
  const { preferFlat = false, limit = 6 } = opts

  if (played.length === 0) {
    return { candidates: [], pcs: [], bassPc: null, fallbackDesc: null }
  }

  // 去重 pitch class，保留最高/最低 midi 用来定低音
  const pcSet = new Set<number>()
  for (const n of played) pcSet.add(pc(n.pc))
  const pcs = [...pcSet].sort((a, b) => a - b)

  // 低音：优先用 midi，其次用弦序（弦序越小越低），最后退回点击顺序
  let bass: PlayedNote | null = null
  for (const n of played) {
    if (bass === null) { bass = n; continue }
    if (n.midi !== undefined && bass.midi !== undefined) {
      if (n.midi < bass.midi) bass = n
    } else if (n.stringIdx !== undefined && bass.stringIdx !== undefined) {
      if (n.stringIdx < bass.stringIdx) bass = n
    }
  }
  const bassPc = bass ? pc(bass.pc) : null

  if (pcs.length === 1) {
    return {
      candidates: [],
      pcs,
      bassPc,
      fallbackDesc: '只按了一个音，至少需要 2 个音才能构成音程，3 个音才能构成三和弦。',
    }
  }

  const candidates: ChordCandidate[] = []

  for (const rootPc of pcs) {
    const rel = pcs.map((p) => (p - rootPc + 12) % 12)
    const relMask = toMask(rel)

    for (const def of CHORDS) {
      const essMask = toMask(def.essential)
      // ① 特征音必须全部在场，否则这个和弦不成立
      if ((essMask & relMask) !== essMask) continue

      const defMask = toMask(def.intervals)
      const matched = def.intervals.filter((i) => relMask & (1 << i))
      const missing = def.intervals.filter((i) => !(relMask & (1 << i)))
      const extra = rel.filter((i) => !(defMask & (1 << i)))

      const perfect = missing.length === 0 && extra.length === 0 && pcs.length === def.intervals.length
      const bassIsRoot = bassPc !== null && bassPc === rootPc

      // ② 低音证据：这是消歧的关键。
      //    {C,E,G,A} 这堆音里 C6 / Am7 都"完美匹配"，只有低音能决定读法。
      //    低音是根音 → 最强证据（原位和弦占绝大多数）
      //    低音是 3 音 / 7 音 → 较强证据（这两个音定义和弦性质，转位很常见）
      //    低音是 5 音 → 几乎不提供信息（最弱的转位）
      //    低音不在和弦内 → 说明根音多半猜错了
      const bassEvidence = (() => {
        if (bassPc === null) return 0
        const iv = (bassPc - rootPc + 12) % 12
        if (iv === 0) return 40
        if (iv === 3 || iv === 4) return 10
        if (iv === 10 || iv === 11) return 8
        if (iv === 7) return -10
        return -16
      })()

      // ③ 评分
      let score = def.priority
      score -= missing.length * 9
      score -= extra.length * 15
      score -= Math.abs(def.intervals.length - pcs.length) * 5
      score += bassEvidence
      if (perfect) score += 30

      const rootName = spellRoot(rootPc, preferFlat)
      const symbol = rootName + def.suffix
      const rootInChord = rel.includes(0)
      const bassInterval = bassPc !== null ? (bassPc - rootPc + 12) % 12 : null
      const inversion =
        bassInterval === null || !def.intervals.includes(bassInterval)
          ? null
          : def.intervals.indexOf(bassInterval)

      candidates.push({
        rootPc,
        rootName,
        def,
        suffix: def.suffix,
        symbol,
        fullSymbol:
          bassPc !== null && bassPc !== rootPc
            ? `${symbol}/${spellRoot(bassPc, preferFlat)}`
            : symbol,
        nameZh: def.nameZh,
        score,
        matched,
        missing,
        extra,
        bassPc,
        bassName: bassPc !== null ? spellRoot(bassPc, preferFlat) : null,
        bassIsRoot,
        inversion,
        perfect,
      })

      void rootInChord
    }
  }

  // ③ 排序：先按分数，再按常用度，再按根音音高稳定排序
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.def.priority !== a.def.priority) return b.def.priority - a.def.priority
    return a.rootPc - b.rootPc
  })

  // ④ 相对阈值过滤：只保留和第一名分数接近的读法。
  //    真正值得展示的是「有歧义的读法」（C6 vs Am7 只差几分），
  //    而不是硬凑出来的（C E G 里三角都在，还报 Em/C 就没意义了）。
  const GAP = 55
  const cutoff = (candidates[0]?.score ?? 0) - GAP
  const viable = candidates.filter((c) => c.score >= cutoff)

  // ⑤ 去重：同一个 fullSymbol 只留最高分的
  const seen = new Set<string>()
  const deduped: ChordCandidate[] = []
  for (const c of viable) {
    const key = c.fullSymbol
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(c)
    if (deduped.length >= limit) break
  }

  if (deduped.length === 0) {
    // 没有任何模板匹配 → 用音程描述兜底
    const root = pcs[0]
    const desc = pcs
      .map((p) => INTERVAL_NAME[(p - root + 12) % 12])
      .filter((_, i) => i > 0)
      .join(' + ')
    return {
      candidates: [],
      pcs,
      bassPc,
      fallbackDesc: `识别不出常见和弦名。以 ${spellRoot(root, preferFlat)} 为根音的音程关系是：${desc}。`,
    }
  }

  return { candidates: deduped, pcs, bassPc, fallbackDesc: null }
}

// ────────────────────────────────────────────────────────────
// 解析用户输入的和弦名
// ────────────────────────────────────────────────────────────

const SUFFIX_LOOKUP: Map<string, ChordDef> = (() => {
  const m = new Map<string, ChordDef>()
  const norm = (s: string) =>
    s
      .replace(/♯/g, '#')
      .replace(/♭/g, 'b')
      .replace(/Δ/g, 'maj')
      .replace(/[–—−]/g, '-')
      .replace(/\s+/g, '')
      .toLowerCase()
  for (const c of CHORDS) {
    m.set(norm(c.suffix), c)
    m.set(norm(c.id), c)
    for (const a of c.aliases ?? []) m.set(norm(a), c)
    // 'maj' 与 'M' 的大写差异在 norm 里已经抹平
  }
  m.set('', CHORD_BY_ID.maj)
  m.set('major', CHORD_BY_ID.maj)
  m.set('minor', CHORD_BY_ID.min)
  return m
})()

export interface ParsedChord {
  rootPc: number
  rootName: string
  def: ChordDef
  symbol: string
}

/**
 * 解析和弦符号，如 'Cmaj7' / 'F#m7b5' / 'Bb7#9' / 'A'。
 * 解析失败返回 null。
 */
export function parseChordSymbol(input: string): ParsedChord | null {
  const s = input.trim().replace(/♯/g, '#').replace(/♭/g, 'b').replace(/Δ/g, 'maj')
  const m = /^([A-Ga-g])([#bx♯♭]*)(.*)$/.exec(s)
  if (!m) return null

  const letterIdx = 'CDEFGAB'.indexOf(m[1].toUpperCase())
  let acc = 0
  for (const ch of m[2]) {
    if (ch === '#') acc += 1
    else if (ch === 'b') acc -= 1
    else if (ch === 'x') acc += 2
  }
  const LETTER_PC = [0, 2, 4, 5, 7, 9, 11]
  const rootPc = (((LETTER_PC[letterIdx] + acc) % 12) + 12) % 12
  const rootName = spellWithLetter(rootPc, letterIdx)

  // 处理斜杠低音：只取斜杠前的部分做和弦
  const rest = m[3].split('/')[0]
  const key = rest.replace(/[–—−]/g, '-').replace(/\s+/g, '').toLowerCase()
  const def = SUFFIX_LOOKUP.get(key)
  if (!def) return null

  return { rootPc, rootName, def, symbol: rootName + def.suffix }
}

/** 供 UI 做和弦选择器：按类别分组 */
export function chordsByCategory(): { category: ChordCategory; label: string; chords: ChordDef[] }[] {
  const order: ChordCategory[] = ['triad', 'suspended', 'sixth', 'seventh', 'added', 'extended', 'altered']
  return order.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    chords: CHORDS.filter((c) => c.category === category),
  }))
}

export { popcount }
