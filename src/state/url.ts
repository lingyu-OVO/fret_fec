/**
 * url.ts — 把应用状态编解码到 URL query
 *
 * 两个作用：
 *   ① 分享：练到一半的音阶/和弦可以直接把链接发给别人（对应架构文档里的 shared_links）
 *   ② 无后端也能「保存进度」：书签即存档
 *
 * 只存「标识符」级的字段（模式、调、音阶 id、和弦符号），不存坐标数组，链接才短。
 * 多指板用逗号分隔：sboards=C:ionian,A:minor-pentatonic  /  cboards=Cmaj7,Am7
 */

import { parseNoteName } from '../theory/notes'
import { SCALE_BY_ID } from '../theory/scales'
import {
  clampStrings,
  MIN_STRINGS,
  TUNING_BY_ID,
  type TuningMode,
} from '../theory/tunings'
import { parseChordSymbol } from '../theory/chords'

export type Mode = 'explore' | 'scale' | 'chord'
export type ChordSub = 'identify' | 'library'
export type Theme = 'dark' | 'light'

export interface UrlScaleBoard {
  keyPc: number
  keyLetterIdx: number
  scaleId: string
}

export interface UrlChordBoard {
  rootPc: number
  chordId: string
}

export interface ParsedUrl {
  mode?: Mode
  theme?: Theme
  tuningId?: string
  /** 调弦模式：固定调弦 / 自由调弦 */
  tuningMode?: TuningMode
  /** 自由调弦逐弦音高（MIDI，低音弦 → 高音弦） */
  customStrings?: number[]
  fretCount?: number
  startFret?: number
  preferFlat?: boolean
  scaleBoards?: UrlScaleBoard[]
  chordBoards?: UrlChordBoard[]
  chordSub?: ChordSub
  /** 已点出的音符，格式 "弦-品,弦-品" */
  notes?: { stringIdx: number; fret: number }[]
}

export interface UrlSnapshot {
  mode: Mode
  theme: Theme
  tuningId: string
  tuningMode: TuningMode
  /** 自由调弦的弦音高。仅在自由模式下写入 URL —— 固定模式下它不影响显示，写进去只会让链接变长 */
  customStrings: number[]
  fretCount: number
  startFret: number
  preferFlat: boolean
  scaleBoards: { key: string; scaleId: string }[]
  /** 和弦符号，如 'Cmaj7' */
  chordBoards: string[]
  chordSub: ChordSub
  notes: { stringIdx: number; fret: number }[]
}

const FRET_COUNTS = [12, 15, 17, 22, 24]
const START_FRETS = [0, 1, 3, 5, 7, 9, 12]
const MAX_URL_BOARDS = 6

function parseKeyAndScale(token: string): UrlScaleBoard | null {
  const at = token.lastIndexOf(':')
  if (at <= 0) return null
  const keyName = token.slice(0, at)
  const scaleId = token.slice(at + 1)
  const note = parseNoteName(keyName)
  if (!note || !SCALE_BY_ID[scaleId]) return null
  return { keyPc: note.pc, keyLetterIdx: note.letterIdx, scaleId }
}

/** 从 location.search 解析初始状态；非法值一律忽略，退回默认 */
export function parseUrl(search: string): ParsedUrl {
  const q = new URLSearchParams(search)
  const out: ParsedUrl = {}

  const mode = q.get('mode')
  if (mode === 'explore' || mode === 'scale' || mode === 'chord') out.mode = mode

  const theme = q.get('theme')
  if (theme === 'dark' || theme === 'light') out.theme = theme

  const tuning = q.get('tuning')
  if (tuning && TUNING_BY_ID[tuning]) out.tuningId = tuning

  const tmode = q.get('tmode')
  if (tmode === 'fixed' || tmode === 'free') out.tuningMode = tmode

  // 自由调弦的逐弦音高，形如 strings=36,43,48,53,57,62
  const strings = q.get('strings')
  if (strings) {
    const list = strings
      .split(',')
      .map((tok) => (tok.trim() === '' ? NaN : Number(tok)))
      .filter((n) => Number.isInteger(n))
    const clean = clampStrings(list)
    // 弦数不足 4 根就整条丢弃：半截链接会造出一块没法用的指板，不如退回默认
    if (clean.length >= MIN_STRINGS) out.customStrings = clean
  }

  const frets = Number(q.get('frets'))
  if (FRET_COUNTS.includes(frets)) out.fretCount = frets

  const start = Number(q.get('start'))
  if (START_FRETS.includes(start)) out.startFret = start

  const flat = q.get('flat')
  if (flat === '1' || flat === '0') out.preferFlat = flat === '1'

  // 多指板
  const sboards = q.get('sboards')
  if (sboards) {
    const list = sboards
      .split(',')
      .map(parseKeyAndScale)
      .filter((b): b is UrlScaleBoard => b !== null)
      .slice(0, MAX_URL_BOARDS)
    if (list.length > 0) out.scaleBoards = list
  }

  const cboards = q.get('cboards')
  if (cboards) {
    const list = cboards
      .split(',')
      .map((token) => {
        const parsed = parseChordSymbol(token)
        return parsed ? { rootPc: parsed.rootPc, chordId: parsed.def.id } : null
      })
      .filter((b): b is UrlChordBoard => b !== null)
      .slice(0, MAX_URL_BOARDS)
    if (list.length > 0) out.chordBoards = list
  }

  // 旧版单指板链接的兼容：key=C&scale=ionian
  if (!out.scaleBoards) {
    const key = q.get('key')
    const scale = q.get('scale')
    if (key && scale && SCALE_BY_ID[scale]) {
      const note = parseNoteName(key)
      if (note) out.scaleBoards = [{ keyPc: note.pc, keyLetterIdx: note.letterIdx, scaleId: scale }]
    }
  }
  if (!out.chordBoards) {
    const chord = q.get('chord')
    if (chord) {
      const parsed = parseChordSymbol(chord)
      if (parsed) out.chordBoards = [{ rootPc: parsed.rootPc, chordId: parsed.def.id }]
    }
  }

  const sub = q.get('sub')
  if (sub === 'identify' || sub === 'library') out.chordSub = sub

  const notes = q.get('notes')
  if (notes) {
    const cells = notes
      .split(',')
      .map((pair) => {
        const [s, f] = pair.split('-').map(Number)
        if (!Number.isInteger(s) || !Number.isInteger(f) || s < 0 || f < 0 || f > 36) return null
        return { stringIdx: s, fret: f }
      })
      .filter((c): c is { stringIdx: number; fret: number } => c !== null)
    if (cells.length > 0) out.notes = cells.slice(0, 12)
  }

  return out
}

/** 把状态写回地址栏（用 replaceState，不污染浏览历史） */
export function syncUrl(snap: UrlSnapshot): void {
  if (typeof window === 'undefined') return
  const q = new URLSearchParams()
  q.set('mode', snap.mode)
  q.set('theme', snap.theme)
  q.set('tuning', snap.tuningId)
  q.set('tmode', snap.tuningMode)
  if (snap.tuningMode === 'free' && snap.customStrings.length > 0) {
    q.set('strings', snap.customStrings.join(','))
  }
  q.set('frets', String(snap.fretCount))
  q.set('start', String(snap.startFret))
  q.set('flat', snap.preferFlat ? '1' : '0')

  if (snap.scaleBoards.length > 0) {
    q.set('sboards', snap.scaleBoards.map((b) => `${b.key}:${b.scaleId}`).join(','))
  }
  if (snap.chordBoards.length > 0) {
    q.set('cboards', snap.chordBoards.join(','))
  }
  if (snap.mode === 'chord') {
    q.set('sub', snap.chordSub)
    if (snap.chordSub === 'identify' && snap.notes.length > 0) {
      q.set('notes', snap.notes.map((n) => `${n.stringIdx}-${n.fret}`).join(','))
    }
  }

  const next = `${window.location.pathname}?${q.toString()}`
  if (next !== window.location.pathname + window.location.search) {
    window.history.replaceState(null, '', next)
  }
}
