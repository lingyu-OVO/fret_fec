import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { pluck, setAudioEnabled, strum, unlockAudio } from './audio/synth'
import { BoardCard, type Board, type BoardPatch, type ChordCell, type ChordSubMode, type Mode } from './components/BoardCard'
import { ChordPanel } from './components/ChordPanel'
import { Chip, Select, Switch } from './components/Controls'
import { ExplorePanel } from './components/ExplorePanel'
import type { FretMark } from './components/Fretboard'
import { ScalePanel, POSITION_WINDOWS } from './components/ScalePanel'
import { TuningPanel } from './components/TuningPanel'
import { CHORD_BY_ID, identifyChord, intervalToDegree, spellRoot } from './theory/chords'
import { KEY_CHOICES, defaultSpell, midiToOctave, pc as toPc } from './theory/notes'
import { buildScale, SCALE_BY_ID, SCALES } from './theory/scales'
import {
  makeCustomTuning,
  noteAt,
  stringLabel,
  stringsOf,
  TUNINGS,
  TUNING_BY_ID,
  type TuningMode,
} from './theory/tunings'
import { findVoicings, type Voicing } from './theory/voicings'
import { parseUrl, syncUrl } from './state/url'

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: 'explore', label: '指板探索', hint: '点任意一品看音名' },
  { value: 'scale', label: '音阶', hint: '选调式点亮全指板，可并排对比多个音阶' },
  { value: 'chord', label: '和弦', hint: '识别 / 查按法，可并排放多个和弦' },
]

const FRET_COUNTS = [12, 15, 17, 22, 24]
const START_FRETS = [0, 1, 3, 5, 7, 9, 12]
const NATURAL_SET = new Set([0, 2, 4, 5, 7, 9, 11])
const MAX_BOARDS = 6
const THEME_KEY = 'fretlab.theme'
const SIDE_KEY = 'fretlab.side'

type Theme = 'dark' | 'light'
type Cols = '1' | '2' | '3'
/** 右侧面板区：展开时占一列，收起时只留一条竖着放的展开按钮 */
type SideState = 'open' | 'collapsed'

const INIT = parseUrl(typeof window === 'undefined' ? '' : window.location.search)

// ── 初始指板 ─────────────────────────────────────────────

let seq = 0
const nextId = () => `b${++seq}`

function buildInitialBoards(): Board[] {
  const scaleSeeds = INIT.scaleBoards?.length
    ? INIT.scaleBoards
    : [{ keyPc: 9, keyLetterIdx: 5, scaleId: 'minor-pentatonic' }]
  const chordSeeds = INIT.chordBoards?.length ? INIT.chordBoards : [{ rootPc: 0, chordId: 'maj' }]

  return [
    { id: nextId(), mode: 'explore', selection: INIT.notes ?? [] },
    ...scaleSeeds.map<Board>((s) => ({
      id: nextId(),
      mode: 'scale',
      keyPc: s.keyPc,
      keyLetterIdx: s.keyLetterIdx,
      scaleId: s.scaleId,
    })),
    ...chordSeeds.map<Board>((c) => ({
      id: nextId(),
      mode: 'chord',
      rootPc: c.rootPc,
      chordId: c.chordId,
      voicingIndex: 0,
      selection: [],
    })),
  ]
}

/** 模块级只求值一次：useState 与 activeId 的初始化必须看到同一批 id */
const INITIAL_BOARDS = buildInitialBoards()
const INITIAL_ACTIVE_ID =
  INITIAL_BOARDS.find((b) => b.mode === (INIT.mode ?? 'explore'))?.id ?? INITIAL_BOARDS[0].id

function initialTheme(): Theme {
  if (INIT.theme) return INIT.theme
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
  } catch {
    /* 隐私模式下 localStorage 可能不可用 */
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'dark'
}

/**
 * 侧栏收起的记忆。
 * 只进 localStorage 不进 URL：这是「这台设备上我怎么看」的偏好，
 * 和调式/和弦这种要分享的内容不是一类东西，塞进分享链接只会变脏。
 */
function initialSide(): SideState {
  try {
    if (localStorage.getItem(SIDE_KEY) === 'collapsed') return 'collapsed'
  } catch {
    /* 隐私模式下 localStorage 可能不可用 */
  }
  return 'open'
}

export default function App() {
  // ── 全局 ──
  const [mode, setMode] = useState<Mode>(INIT.mode ?? 'explore')
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [side, setSide] = useState<SideState>(initialSide)
  const [cols, setCols] = useState<Cols>('1')
  const [tuningId, setTuningId] = useState(INIT.tuningId ?? 'standard-e')
  const [tuningMode, setTuningMode] = useState<TuningMode>(INIT.tuningMode ?? 'fixed')
  const [customStrings, setCustomStrings] = useState<number[]>(
    INIT.customStrings ?? stringsOf(TUNING_BY_ID['standard-e']),
  )
  /** 用户是否亲手调过自由调弦。没调过时进自由模式会用当前固定调弦打底 */
  const [customTouched, setCustomTouched] = useState(Boolean(INIT.customStrings))
  const [fretCount, setFretCount] = useState(INIT.fretCount ?? 15)
  const [startFret, setStartFret] = useState(INIT.startFret ?? 0)
  const [preferFlat, setPreferFlat] = useState(INIT.preferFlat ?? false)
  const [audioOn, setAudioOn] = useState(true)

  // ── 多指板 ──
  const [boards, setBoards] = useState<Board[]>(INITIAL_BOARDS)
  const [activeId, setActiveId] = useState<string>(INITIAL_ACTIVE_ID)

  // ── 显示选项（对所有指板生效）──
  const [showAllNotes, setShowAllNotes] = useState(true)
  const [naturalsOnly, setNaturalsOnly] = useState(false)
  const [showDegrees, setShowDegrees] = useState(true)
  const [onlyRoots, setOnlyRoots] = useState(false)
  const [showOutside, setShowOutside] = useState(false)
  const [positionWindowId, setPositionWindowId] = useState('all')
  const [showStringNumbers, setShowStringNumbers] = useState(true)
  const [showStringNames, setShowStringNames] = useState(true)
  const [showToneMap, setShowToneMap] = useState(true)

  // ── 和弦 ──
  const [chordSub, setChordSub] = useState<ChordSubMode>(INIT.chordSub ?? 'identify')
  const [voicingOpts, setVoicingOpts] = useState({
    requireRootInBass: true,
    allowOpen: true,
    maxSpan: 4,
    minSounding: 4,
  })
  const [parseInput, setParseInput] = useState('')
  const [refKeyPc, setRefKeyPc] = useState(0)
  const [readout, setReadout] = useState<string | null>(null)
  const [hoverCell, setHoverCell] = useState<ChordCell | null>(null)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const fixedTuning = TUNING_BY_ID[tuningId] ?? TUNINGS[0]

  /**
   * 当前生效的调弦（固定模式取调弦表，自由模式按用户输入构造）。
   *
   * 必须 useMemo：下游的和弦指型搜索以 tuning 为依赖，
   * 要是每次渲染都给出新对象，那块 findVoicings 会被整片打掉重算。
   */
  const tuning = useMemo(
    () => (tuningMode === 'free' ? makeCustomTuning(customStrings, preferFlat) : fixedTuning),
    [tuningMode, customStrings, preferFlat, fixedTuning],
  )

  const handleTuningMode = useCallback(
    (next: TuningMode) => {
      // 首次进自由模式时拿当前固定调弦打底，免得突然冒出一块和刚才毫无关系的指板；
      // 调过之后就不再覆盖，否则来回切一次就把用户逐弦调好的结果全冲掉。
      if (next === 'free' && !customTouched) setCustomStrings(stringsOf(fixedTuning))
      setTuningMode(next)
    },
    [customTouched, fixedTuning],
  )

  const handleCustomStrings = useCallback((next: number[]) => {
    setCustomTouched(true)
    setCustomStrings(next)
  }, [])

  // ── 主题落到 <html> 上并持久化 ──
  // 用 useLayoutEffect：主题属性要在浏览器绘制前就写好，避免亮→暗闪一下；
  // 顺带也让 flushSync 驱动的浏览器测试能同步读到结果。
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* 忽略 */
    }
  }, [theme])

  useEffect(() => {
    const unlock = () => unlockAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  // ── 侧栏收起状态持久化（刷新后保持你习惯的看法）──
  useEffect(() => {
    try {
      localStorage.setItem(SIDE_KEY, side)
    } catch {
      /* 忽略 */
    }
  }, [side])

  useEffect(() => {
    setAudioEnabled(audioOn)
  }, [audioOn])

  // 换调弦时清掉超出弦数的标记
  useEffect(() => {
    const n = tuning.strings.length
    setBoards((prev) =>
      prev.map((b) =>
        b.mode === 'explore' || b.mode === 'chord'
          ? { ...b, selection: b.selection.filter((c) => c.stringIdx < n) }
          : b,
      ),
    )
  }, [tuning.strings.length])

  // ── 派生 ──
  const modeBoards = useMemo(() => boards.filter((b) => b.mode === mode), [boards, mode])
  const active = useMemo(
    () => modeBoards.find((b) => b.id === activeId) ?? modeBoards[0] ?? null,
    [modeBoards, activeId],
  )

  // 切换模式时，把激活指板切到该模式的第一块
  useEffect(() => {
    if (!modeBoards.some((b) => b.id === activeId) && modeBoards[0]) setActiveId(modeBoards[0].id)
  }, [modeBoards, activeId])

  const posWindow = POSITION_WINDOWS.find((w) => w.id === positionWindowId) ?? POSITION_WINDOWS[0]

  // ── 指型搜索缓存：多个和弦指板同时存在时避免重复计算 ──
  const voicingCache = useRef(new Map<string, Voicing[]>())
  const voicingsByBoard = useMemo(() => {
    const out = new Map<string, Voicing[]>()
    const cache = voicingCache.current
    for (const b of boards) {
      if (b.mode !== 'chord') continue
      const def = CHORD_BY_ID[b.chordId] ?? CHORD_BY_ID.maj
      const key = `${b.chordId}|${b.rootPc}|${tuningId}|${voicingOpts.requireRootInBass}|${voicingOpts.allowOpen}|${voicingOpts.maxSpan}|${voicingOpts.minSounding}`
      let vs = cache.get(key)
      if (!vs) {
        vs = findVoicings(def, b.rootPc, tuning, { ...voicingOpts, limit: 48 })
        cache.set(key, vs)
      }
      out.set(b.id, vs)
    }
    return out
  }, [boards, tuning, tuningId, voicingOpts])

  const play = useCallback((midi: number) => {
    pluck(midi, { gain: 0.24 })
  }, [])

  const describe = useCallback(
    (stringIdx: number, fret: number) => {
      const midi = noteAt(tuning, stringIdx, fret)
      return `${defaultSpell(toPc(midi), preferFlat)}${midiToOctave(midi)} · ${stringLabel(tuning, stringIdx)} 弦 ${
        fret === 0 ? '空弦' : `${fret} 品`
      }`
    },
    [tuning, preferFlat],
  )

  const playedOf = useCallback(
    (cells: ChordCell[]) =>
      cells.map((c) => ({
        pc: toPc(noteAt(tuning, c.stringIdx, c.fret)),
        midi: noteAt(tuning, c.stringIdx, c.fret),
        stringIdx: c.stringIdx,
        fret: c.fret,
      })),
    [tuning],
  )

  // ══════════════════════════════════════════════════════════
  // 每块指板的标记
  // ══════════════════════════════════════════════════════════

  const fretsShown = useMemo(() => {
    const list: number[] = []
    if (startFret === 0) list.push(0)
    for (let f = startFret === 0 ? 1 : startFret; f < startFret + fretCount; f++) list.push(f)
    return list
  }, [startFret, fretCount])

  const computeMarks = useCallback(
    (b: Board): FretMark[] => {
      const out: FretMark[] = []
      const inWindow = (f: number) => f === 0 || (f >= posWindow.start && f <= posWindow.end)

      if (b.mode === 'explore') {
        if (showAllNotes) {
          for (let s = 0; s < tuning.strings.length; s++) {
            for (const f of fretsShown) {
              const p = toPc(noteAt(tuning, s, f))
              if (naturalsOnly && !NATURAL_SET.has(p)) continue
              out.push({
                stringIdx: s,
                fret: f,
                label: defaultSpell(p, preferFlat),
                variant: 'muted',
              })
            }
          }
        }
        for (const c of b.selection) {
          const midi = noteAt(tuning, c.stringIdx, c.fret)
          const p = toPc(midi)
          out.push({
            stringIdx: c.stringIdx,
            fret: c.fret,
            label: defaultSpell(p, preferFlat),
            sub: String(midiToOctave(midi)),
            variant: 'selected',
          })
        }
        return out
      }

      if (b.mode === 'scale') {
        const def = SCALE_BY_ID[b.scaleId] ?? SCALES[0]
        const tones = buildScale(b.keyPc, b.keyLetterIdx, def)
        const byPc = new Map(tones.map((t) => [t.pc, t]))
        for (let s = 0; s < tuning.strings.length; s++) {
          for (const f of fretsShown) {
            const p = toPc(noteAt(tuning, s, f))
            const tone = byPc.get(p)
            if (!tone) {
              if (showOutside && inWindow(f)) {
                out.push({
                  stringIdx: s,
                  fret: f,
                  label: defaultSpell(p, preferFlat),
                  variant: 'ghost',
                })
              }
              continue
            }
            const isRoot = tone.degree === '1'
            if (onlyRoots && !isRoot) continue
            // 音级 + 音名两个都要显示：大圆上半是音级，下半是音名
            out.push(
              showDegrees
                ? { stringIdx: s, fret: f, label: tone.degree, sub: tone.name, variant: isRoot ? 'root' : 'tone' }
                : { stringIdx: s, fret: f, label: tone.name, sub: tone.degree, variant: isRoot ? 'root' : 'tone' },
            )
          }
        }
        return out
      }

      // 和弦
      if (chordSub === 'identify') {
        const best = identifyChord(playedOf(b.selection), { preferFlat }).candidates[0]
        for (const c of b.selection) {
          const midi = noteAt(tuning, c.stringIdx, c.fret)
          const p = toPc(midi)
          const deg = best ? intervalToDegree((p - best.rootPc + 12) % 12, best.def.intervals) : undefined
          out.push({
            stringIdx: c.stringIdx,
            fret: c.fret,
            label: deg ?? defaultSpell(p, preferFlat),
            sub: deg ? defaultSpell(p, preferFlat) : undefined,
            variant: deg === '1' ? 'root' : 'selected',
          })
        }
        return out
      }

      const def = CHORD_BY_ID[b.chordId] ?? CHORD_BY_ID.maj
      const vs = voicingsByBoard.get(b.id) ?? []
      const v = vs[b.voicingIndex] ?? vs[0]

      // 底图：全指板的和弦音分布
      if (showToneMap) {
        for (let s = 0; s < tuning.strings.length; s++) {
          for (const f of fretsShown) {
            const p = toPc(noteAt(tuning, s, f))
            const iv = (p - b.rootPc + 12) % 12
            if (!def.intervals.includes(iv)) continue
            out.push({
              stringIdx: s,
              fret: f,
              label: intervalToDegree(iv, def.intervals),
              variant: 'ghost',
            })
          }
        }
      }
      // 选中的指型盖在上面
      if (v) {
        v.frets.forEach((f, s) => {
          if (f === null) return
          const p = toPc(noteAt(tuning, s, f))
          const deg = v.degrees[s]
          out.push(
            showDegrees && deg
              ? {
                  stringIdx: s,
                  fret: f,
                  label: deg,
                  sub: defaultSpell(p, preferFlat),
                  variant: deg === '1' ? 'root' : 'tone',
                }
              : {
                  stringIdx: s,
                  fret: f,
                  label: defaultSpell(p, preferFlat),
                  sub: deg ?? undefined,
                  variant: deg === '1' ? 'root' : 'tone',
                },
          )
        })
      }
      return out
    },
    [
      tuning, fretsShown, posWindow, showAllNotes, naturalsOnly, preferFlat,
      showDegrees, onlyRoots, showOutside, chordSub, showToneMap, playedOf, voicingsByBoard,
    ],
  )

  const marksByBoard = useMemo(() => {
    const m = new Map<string, FretMark[]>()
    for (const b of modeBoards) m.set(b.id, computeMarks(b))
    return m
  }, [modeBoards, computeMarks])

  /** 和弦模式每块指板的标题副信息 */
  const chordInfoByBoard = useMemo(() => {
    const m = new Map<string, { headline: string; footNote: string }>()
    for (const b of modeBoards) {
      if (b.mode !== 'chord') continue
      if (chordSub === 'identify') {
        const best = identifyChord(playedOf(b.selection), { preferFlat }).candidates[0]
        m.set(b.id, {
          headline: best ? best.fullSymbol : b.selection.length > 0 ? '识别中…' : '未点音',
          footNote: best ? best.def.nameZh : '',
        })
      } else {
        const vs = voicingsByBoard.get(b.id) ?? []
        const v = vs[b.voicingIndex] ?? vs[0]
        m.set(b.id, {
          headline: '',
          footNote: `${vs.length} 种指型${v ? ` · 当前 ${v.frets.map((f) => (f === null ? 'x' : f)).join('')}` : ''}`,
        })
      }
    }
    return m
  }, [modeBoards, chordSub, preferFlat, playedOf, voicingsByBoard])

  // ══════════════════════════════════════════════════════════
  // 指板增删改
  // ══════════════════════════════════════════════════════════

  const patchBoard = useCallback((id: string, patch: BoardPatch) => {
    setBoards((prev) => prev.map((b) => (b.id === id ? ({ ...b, ...patch } as Board) : b)))
  }, [])

  const addBoard = useCallback(() => {
    const src = active
    let created: Board
    if (!src || src.mode === 'explore') {
      created = { id: nextId(), mode: 'explore', selection: [] }
    } else if (src.mode === 'scale') {
      // 顺手切到列表里的下一个音阶，避免新指板和原来一模一样
      const idx = SCALES.findIndex((s) => s.id === src.scaleId)
      const nextScale = SCALES[(idx + 1) % SCALES.length]
      created = { id: nextId(), mode: 'scale', keyPc: src.keyPc, keyLetterIdx: src.keyLetterIdx, scaleId: nextScale.id }
    } else {
      // 根音上行四度：和弦进行最常见的走向
      const nextPc = (src.rootPc + 5) % 12
      const k = KEY_CHOICES.find((x) => x.pc === nextPc)!
      created = { id: nextId(), mode: 'chord', rootPc: k.pc, chordId: src.chordId, voicingIndex: 0, selection: [] }
    }
    setBoards((prev) => [...prev, created])
    setActiveId(created.id)
  }, [active])

  const duplicateBoard = useCallback((id: string) => {
    setBoards((prev) => {
      const src = prev.find((b) => b.id === id)
      if (!src) return prev
      const copy: Board =
        src.mode === 'scale'
          ? { ...src, id: nextId() }
          : { ...src, id: nextId(), selection: src.selection.map((c) => ({ ...c })) }
      return [...prev, copy]
    })
  }, [])

  const removeBoard = useCallback(
    (id: string) => {
      setBoards((prev) => {
        const target = prev.find((b) => b.id === id)
        const next = prev.filter((b) => b.id !== id)
        if (target && id === activeId) {
          const sameMode = next.filter((b) => b.mode === target.mode)
          setActiveId(sameMode[0]?.id ?? '')
        }
        return next
      })
    },
    [activeId],
  )

  // 每种模式至少留一块
  const canRemove = modeBoards.length > 1

  // ══════════════════════════════════════════════════════════
  // 交互
  // ══════════════════════════════════════════════════════════

  const handleCellClick = useCallback(
    (boardId: string, stringIdx: number, fret: number) => {
      const midi = noteAt(tuning, stringIdx, fret)
      setActiveId(boardId)

      const b = boards.find((x) => x.id === boardId)
      const picking = b && (b.mode === 'explore' || (b.mode === 'chord' && chordSub === 'identify'))
      if (b && picking && (b.mode === 'explore' || b.mode === 'chord')) {
        const has = b.selection.some((c) => c.stringIdx === stringIdx && c.fret === fret)
        patchBoard(boardId, {
          selection: has
            ? b.selection.filter((c) => !(c.stringIdx === stringIdx && c.fret === fret))
            : [...b.selection, { stringIdx, fret }],
        } as Partial<Board>)
      }

      play(midi)
      setReadout(describe(stringIdx, fret))
    },
    [boards, chordSub, tuning, patchBoard, play, describe],
  )

  const playScale = useCallback(
    (b: Board) => {
      if (b.mode !== 'scale') return
      const def = SCALE_BY_ID[b.scaleId] ?? SCALES[0]
      const tones = buildScale(b.keyPc, b.keyLetterIdx, def)
      const base = 40 + ((b.keyPc - 4 + 12) % 12)
      const seq = tones.map((t) => base + t.interval)
      seq.push(base + 12)
      seq.forEach((m, i) => pluck(m, { delay: i * 0.16, gain: 0.22 }))
    },
    [],
  )

  const playVoicing = useCallback(
    (v: Voicing) => {
      strum(v.frets.map((f, s) => (f === null ? null : noteAt(tuning, s, f))))
    },
    [tuning],
  )

  // ── URL 同步 ──
  useEffect(() => {
    syncUrl({
      mode,
      theme,
      tuningId,
      tuningMode,
      customStrings,
      fretCount,
      startFret,
      preferFlat,
      scaleBoards: boards
        .filter((b): b is Extract<Board, { mode: 'scale' }> => b.mode === 'scale')
        .map((b) => ({
          key: KEY_CHOICES.find((k) => k.pc === b.keyPc)?.name ?? 'C',
          scaleId: b.scaleId,
        })),
      chordBoards: boards
        .filter((b): b is Extract<Board, { mode: 'chord' }> => b.mode === 'chord')
        .map((b) => `${spellRoot(b.rootPc, preferFlat)}${(CHORD_BY_ID[b.chordId] ?? CHORD_BY_ID.maj).suffix}`),
      chordSub,
      notes: active && (active.mode === 'explore' || active.mode === 'chord') ? active.selection : [],
    })
  }, [mode, theme, tuningId, tuningMode, customStrings, fretCount, startFret, preferFlat, boards, chordSub, active])

  // ══════════════════════════════════════════════════════════
  // 渲染
  // ══════════════════════════════════════════════════════════

  const hint =
    mode === 'explore'
      ? '点击指板任意位置标记音名，再点一次取消 · 点另一块指板可以切换它成为「当前」'
      : mode === 'scale'
        ? '每块指板可以选不同的调和调式，往下依次排列 · 点指板可试听该位置'
        : chordSub === 'identify'
          ? '在当前指板上把你按的和弦逐个点出来 · 右侧给出识别结果'
          : '点下方指型卡片可以换按法 · 点指板可试听该位置'

  const shadeRanges =
    mode === 'scale' && positionWindowId !== 'all'
      ? [{ from: -1, to: posWindow.start - 1 }, { from: posWindow.end + 1, to: 99 }]
      : undefined

  const activeScaleBoard = active?.mode === 'scale' ? active : null
  const activeChordBoard = active?.mode === 'chord' ? active : null
  const activeExploreBoard = active?.mode === 'explore' ? active : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">𝄞</span>
          <span className="brand-text">
            <b>Fretboard Lab</b>
            <em>电吉他指板学习台</em>
          </span>
        </div>

        <nav className="modes">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              className={`mode-tab${mode === m.value ? ' is-active' : ''}`}
              onClick={() => setMode(m.value)}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </nav>

        <div className="topbar-right">
          {/* 调弦控件已经移到右侧面板，这里只留一个指示器。
              不能干脆不放：右侧面板收起时 .side-col 是 display:none，
              面板里所有信息都看不见，没有这个 Chip 就不知道当前用的什么调弦。 */}
          <Chip
            active={tuningMode === 'free'}
            onClick={() => setSide('open')}
            title="到右侧面板调整调弦（固定调弦 / 自由调弦）"
          >
            {tuningMode === 'free' ? '自由调弦' : tuning.name}
          </Chip>
          <label className="mini-field">
            <span>品数</span>
            <Select
              value={fretCount}
              onChange={setFretCount}
              options={FRET_COUNTS.map((n) => ({ value: n, label: `${n} 品` }))}
              ariaLabel="显示品数"
            />
          </label>
          <label className="mini-field">
            <span>起始</span>
            <Select
              value={startFret}
              onChange={setStartFret}
              options={START_FRETS.map((n) => ({ value: n, label: n === 0 ? '琴枕' : `${n} 品` }))}
              ariaLabel="起始品位"
            />
          </label>
          <label className="mini-field">
            <span>排列</span>
            <Select
              value={cols}
              onChange={setCols}
              options={[
                { value: '1' as Cols, label: '竖排' },
                { value: '2' as Cols, label: '2 列' },
                { value: '3' as Cols, label: '3 列' },
              ]}
              ariaLabel="指板排列方式"
            />
          </label>

          <Chip active={!preferFlat} onClick={() => setPreferFlat((v) => !v)} title="切换升降号记谱偏好">
            {preferFlat ? '♭ 降号' : '♯ 升号'}
          </Chip>
          <Chip
            active={showStringNumbers}
            onClick={() => setShowStringNumbers((v) => !v)}
            title="在指板左侧弦栏显示弦号 6~1"
          >
            6 弦号
          </Chip>
          <Chip
            active={showStringNames}
            onClick={() => setShowStringNames((v) => !v)}
            title="在指板左侧弦栏显示空弦音名 E A D G B E"
          >
            E 弦名
          </Chip>
          <Chip
            active={theme === 'light'}
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            title={theme === 'light' ? '切换到黑夜模式' : '切换到白天模式'}
          >
            {theme === 'light' ? '☀ 白天' : '🌙 黑夜'}
          </Chip>
          <Chip active={audioOn} onClick={() => setAudioOn((v) => !v)} title="开关声音">
            {audioOn ? '🔊' : '🔇'}
          </Chip>
        </div>
      </header>

      <main className="layout" data-side={side}>
        <section className="board-col">
          <div className="board-grid" data-cols={cols}>
            {modeBoards.map((b, i) => (
              <BoardCard
                key={b.id}
                index={i + 1}
                board={b}
                isActive={b.id === active?.id}
                tuning={tuning}
                fretCount={fretCount}
                startFret={startFret}
                marks={marksByBoard.get(b.id) ?? []}
                shadeRanges={shadeRanges}
                showStringNumbers={showStringNumbers}
                showStringNames={showStringNames}
                preferFlat={preferFlat}
                chordSub={chordSub}
                chordHeadline={chordInfoByBoard.get(b.id)?.headline}
                chordFootNote={chordInfoByBoard.get(b.id)?.footNote}
                canRemove={canRemove}
                collapsed={collapsedIds.has(b.id)}
                onToggleCollapse={() => toggleCollapse(b.id)}
                onActivate={() => setActiveId(b.id)}
                onRemove={() => removeBoard(b.id)}
                onDuplicate={() => duplicateBoard(b.id)}
                onCellClick={(s, f) => handleCellClick(b.id, s, f)}
                onCellHover={setHoverCell}
                onSelectKey={(pc, letterIdx) => patchBoard(b.id, { keyPc: pc, keyLetterIdx: letterIdx } as Partial<Board>)}
                onSelectScale={(id) => patchBoard(b.id, { scaleId: id } as Partial<Board>)}
                onSelectRoot={(pc) => patchBoard(b.id, { rootPc: pc } as Partial<Board>)}
                onSelectChord={(id) => patchBoard(b.id, { chordId: id, voicingIndex: 0 } as Partial<Board>)}
                onClearSelection={() => patchBoard(b.id, { selection: [] } as Partial<Board>)}
              />
            ))}

            {modeBoards.length < MAX_BOARDS && (
              <button
                type="button"
                className="board-add"
                onClick={addBoard}
                title={
                  mode === 'scale'
                    ? '再添一块指板对比音阶（会自动切到列表里的下一个音阶）'
                    : mode === 'chord'
                      ? '再添一块指板（根音上行四度，方便搭和弦进行）'
                      : '再添一块空白指板'
                }
              >
                <span className="board-add-plus">＋</span>
                <span>添加指板</span>
                <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.75 }}>
                  当前 {modeBoards.length} / {MAX_BOARDS}
                </span>
              </button>
            )}
          </div>

          <div className="board-bar">
            <span className="hint">{hint}</span>
            {hoverCell ? (
              <span className="readout is-hover">{describe(hoverCell.stringIdx, hoverCell.fret)}</span>
            ) : (
              readout && <span className="readout">{readout}</span>
            )}
          </div>
        </section>

        {side === 'collapsed' && (
          <aside className="side-rail">
            <button
              type="button"
              className="side-toggle is-rail"
              onClick={() => setSide('open')}
              title="展开右侧面板，回到调式 / 和弦设置"
              aria-expanded={false}
              aria-controls="side-panels"
            >
              <span className="side-toggle-arrow" aria-hidden="true">◂</span>
              <span className="side-rail-label">展开面板</span>
            </button>
          </aside>
        )}

        <aside className="side-col" id="side-panels" data-side={side}>
          <div className="side-head">
            <button
              type="button"
              className="side-toggle"
              onClick={() => setSide('collapsed')}
              title="收起右侧面板，指板会立刻放大到整屏宽度"
              aria-expanded={true}
              aria-controls="side-panels"
            >
              <span>收起面板</span>
              <span className="side-toggle-arrow" aria-hidden="true">▸</span>
            </button>
          </div>

          {mode === 'explore' && activeExploreBoard && (
            <ExplorePanel
              tuning={tuning}
              selection={activeExploreBoard.selection}
              showAllNotes={showAllNotes}
              naturalsOnly={naturalsOnly}
              preferFlat={preferFlat}
              refKeyPc={refKeyPc}
              onChangeRefKey={(pc) => setRefKeyPc(pc)}
              onToggleAll={setShowAllNotes}
              onToggleNaturals={setNaturalsOnly}
              onClear={() => patchBoard(activeExploreBoard.id, { selection: [] } as Partial<Board>)}
              onPlay={play}
            />
          )}

          {mode === 'scale' && activeScaleBoard && (
            <ScalePanel
              keyPc={activeScaleBoard.keyPc}
              keyLetterIdx={activeScaleBoard.keyLetterIdx}
              scaleId={activeScaleBoard.scaleId}
              showDegrees={showDegrees}
              onlyRoots={onlyRoots}
              showOutside={showOutside}
              positionWindowId={positionWindowId}
              onChangeKey={(pc, letterIdx) => patchBoard(activeScaleBoard.id, { keyPc: pc, keyLetterIdx: letterIdx } as Partial<Board>)}
              onChangeScale={(id) => patchBoard(activeScaleBoard.id, { scaleId: id } as Partial<Board>)}
              onToggleDegrees={setShowDegrees}
              onToggleRoots={setOnlyRoots}
              onToggleOutside={setShowOutside}
              onChangeWindow={setPositionWindowId}
              onPlayScale={() => playScale(activeScaleBoard)}
            />
          )}

          {mode === 'chord' && activeChordBoard && (
            <ChordPanel
              tuning={tuning}
              preferFlat={preferFlat}
              sub={chordSub}
              onChangeSub={setChordSub}
              selected={activeChordBoard.selection}
              onClearSelection={() => patchBoard(activeChordBoard.id, { selection: [] } as Partial<Board>)}
              onRemoveNote={(cell) =>
                patchBoard(activeChordBoard.id, {
                  selection: activeChordBoard.selection.filter(
                    (c) => !(c.stringIdx === cell.stringIdx && c.fret === cell.fret),
                  ),
                } as Partial<Board>)
              }
              onPlayNote={play}
              onJumpToLibrary={(rootPc, chordId) => {
                patchBoard(activeChordBoard.id, {
                  rootPc,
                  chordId,
                  voicingIndex: 0,
                  selection: [],
                } as Partial<Board>)
                setParseInput('')
                setChordSub('library')
              }}
              libraryRootPc={activeChordBoard.rootPc}
              libraryRootLetterIdx={KEY_CHOICES.find((x) => x.pc === activeChordBoard.rootPc)?.letterIdx ?? 0}
              libraryChordId={activeChordBoard.chordId}
              onChangeLibraryRoot={(pc) => patchBoard(activeChordBoard.id, { rootPc: pc } as Partial<Board>)}
              onChangeLibraryChord={(id) => patchBoard(activeChordBoard.id, { chordId: id, voicingIndex: 0 } as Partial<Board>)}
              voicings={voicingsByBoard.get(activeChordBoard.id) ?? []}
              voicingIndex={activeChordBoard.voicingIndex}
              onSelectVoicing={(i) => patchBoard(activeChordBoard.id, { voicingIndex: i } as Partial<Board>)}
              onPlayVoicing={playVoicing}
              opts={voicingOpts}
              onChangeOpts={(patch) => setVoicingOpts((prev) => ({ ...prev, ...patch }))}
              showToneMap={showToneMap}
              onToggleToneMap={setShowToneMap}
              parseInput={parseInput}
              onChangeParseInput={setParseInput}
            />
          )}

          <TuningPanel
            mode={tuningMode}
            tuningId={tuningId}
            tuning={tuning}
            customStrings={customStrings}
            preferFlat={preferFlat}
            onChangeMode={handleTuningMode}
            onChangeTuningId={setTuningId}
            onChangeStrings={handleCustomStrings}
          />

          <section className="panel">
            <header className="panel-head">
              <div>
                <h2 className="panel-title">全局显示选项</h2>
                <p className="panel-sub">这些设置对上面所有指板同时生效</p>
              </div>
            </header>
            <div className="panel-body">
              <div className="switch-row">
                <Switch checked={showStringNumbers} onChange={setShowStringNumbers} label="显示弦号 6~1" />
                <Switch checked={showStringNames} onChange={setShowStringNames} label="显示空弦音名" />
                <Switch
                  checked={theme === 'light'}
                  onChange={(v) => setTheme(v ? 'light' : 'dark')}
                  label="白天模式"
                  title="也可以跟随系统：首次访问时会自动读取系统的深浅色偏好"
                />
              </div>
              <p className="panel-foot">
                弦号和空弦音名画在指板左侧的独立弦栏里，和音符圆点区域完全分开，任何缩放比例下都不会重叠。
              </p>
            </div>
          </section>

          <footer className="app-foot">
            <p>
              当前：<b>{tuning.name}</b> · {tuning.strings.length} 弦 · {fretCount} 品 · {modeBoards.length} 块指板
            </p>
            <p className="dim">
              乐理计算全部在浏览器本地完成：音阶生成、和弦识别、指型搜索都是纯函数，不发任何网络请求。
            </p>
          </footer>
        </aside>
      </main>
    </div>
  )
}
