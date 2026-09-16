import { chordsByCategory, spellRoot } from '../theory/chords'
import { KEY_CHOICES } from '../theory/notes'
import { SCALE_BY_ID, SCALES, SCALE_CATEGORY_LABEL, type ScaleCategory } from '../theory/scales'
import type { Tuning } from '../theory/tunings'
import { Fretboard, type FretMark } from './Fretboard'
import { Select } from './Controls'

export type Mode = 'explore' | 'scale' | 'chord'
export type ChordSubMode = 'identify' | 'library'

export interface ChordCell {
  stringIdx: number
  fret: number
}

export interface ExploreBoard {
  id: string
  mode: 'explore'
  selection: ChordCell[]
}
export interface ScaleBoard {
  id: string
  mode: 'scale'
  keyPc: number
  keyLetterIdx: number
  scaleId: string
}
export interface ChordBoard {
  id: string
  mode: 'chord'
  rootPc: number
  chordId: string
  voicingIndex: number
  selection: ChordCell[]
}
export type Board = ExploreBoard | ScaleBoard | ChordBoard

/**
 * 指板配置的局部更新。
 * 用「分发后的 Omit」而不是 Omit<Board, ...>：后者会把联合类型塌缩成公共字段，
 * 丢掉 keyPc / chordId 这类只在某一个分支上存在的键。
 */
export type BoardPatch =
  | Partial<Omit<ExploreBoard, 'id' | 'mode'>>
  | Partial<Omit<ScaleBoard, 'id' | 'mode'>>
  | Partial<Omit<ChordBoard, 'id' | 'mode'>>

const SCALE_OPTIONS = (() => {
  const cats = [...new Set(SCALES.map((s) => s.category))] as ScaleCategory[]
  return cats.flatMap((cat) =>
    SCALES.filter((s) => s.category === cat).map((s) => ({
      value: s.id,
      label: `${s.name} · ${s.nameEn}`,
      group: SCALE_CATEGORY_LABEL[cat],
    })),
  )
})()

const CHORD_OPTIONS = chordsByCategory().flatMap((g) =>
  g.chords.map((c) => ({ value: c.id, label: `${c.suffix || '（大三）'} · ${c.nameZh}`, group: g.label })),
)

const KEY_OPTIONS = KEY_CHOICES.map((k) => ({ value: k.pc, label: k.name }))

export interface BoardCardProps {
  index: number
  board: Board
  isActive: boolean
  tuning: Tuning
  fretCount: number
  startFret: number
  marks: FretMark[]
  shadeRanges?: { from: number; to: number }[]
  showStringNumbers: boolean
  showStringNames: boolean
  preferFlat: boolean
  chordSub: ChordSubMode
  /** 和弦模式下的副标题：识别结果显示和弦名，查按法显示指型数 */
  chordHeadline?: string
  chordFootNote?: string
  /** 该模式下是否还允许删除（至少保留一块） */
  canRemove: boolean
  /** 是否折叠（竖排很多块时把不看的收起来） */
  collapsed: boolean
  onToggleCollapse: () => void
  onActivate: () => void
  onRemove: () => void
  onDuplicate: () => void
  onCellClick: (stringIdx: number, fret: number) => void
  onCellHover: (cell: ChordCell | null) => void
  onSelectKey: (pc: number, letterIdx: number) => void
  onSelectScale: (id: string) => void
  onSelectRoot: (pc: number) => void
  onSelectChord: (id: string) => void
  onClearSelection: () => void
}

export function BoardCard(props: BoardCardProps) {
  const { board, isActive, tuning, fretCount, startFret, marks, shadeRanges, preferFlat } = props

  const scaleDef = board.mode === 'scale' ? SCALE_BY_ID[board.scaleId] ?? SCALES[0] : null
  const keyName =
    board.mode === 'scale'
      ? (KEY_CHOICES.find((k) => k.pc === board.keyPc)?.name ?? 'C')
      : null

  const title =
    board.mode === 'explore'
      ? '指板探索'
      : board.mode === 'scale'
        ? `${keyName} ${scaleDef!.name}`
        : props.chordSub === 'identify'
          ? (props.chordHeadline ?? '识别中…')
          : `${spellRoot(board.rootPc, preferFlat)}${CHORD_OPTIONS.find((o) => o.value === board.chordId)?.label.split(' ')[0] ?? ''}`

  const subtitle =
    board.mode === 'explore'
      ? `已标记 ${board.selection.length} 个音`
      : board.mode === 'scale'
        ? scaleDef!.nameEn
        : props.chordSub === 'identify'
          ? `已点出 ${board.selection.length} 个音`
          : props.chordFootNote ?? ''

  return (
    <article
      className={`board-card${isActive ? ' is-active' : ''}${props.collapsed ? ' is-collapsed' : ''}`}
      onPointerDown={props.onActivate}
      aria-label={`指板 ${props.index}：${title}`}
    >
      <header className="board-card-head">
        <button
          type="button"
          className="board-icon-btn board-collapse"
          onClick={props.onToggleCollapse}
          title={props.collapsed ? '展开这块指板' : '折叠这块指板'}
          aria-label={props.collapsed ? '展开指板' : '折叠指板'}
          aria-expanded={!props.collapsed}
        >
          ▾
        </button>
        <span className="board-index">{props.index}</span>
        <span className="board-title">{title}</span>
        <span className="board-title-sub">{subtitle}</span>

        <span className="board-head-spacer" />

        <span className="board-head-controls" onPointerDown={(e) => e.stopPropagation()}>
          {board.mode === 'scale' && (
            <>
              <Select
                value={board.keyPc}
                onChange={(v) => {
                  const k = KEY_CHOICES.find((x) => x.pc === v)!
                  props.onSelectKey(k.pc, k.letterIdx)
                }}
                options={KEY_OPTIONS}
                ariaLabel={`指板 ${props.index} 的调`}
              />
              <Select
                value={board.scaleId}
                onChange={props.onSelectScale}
                options={SCALE_OPTIONS}
                ariaLabel={`指板 ${props.index} 的调式`}
              />
            </>
          )}

          {board.mode === 'chord' && props.chordSub === 'library' && (
            <>
              <Select
                value={board.rootPc}
                onChange={props.onSelectRoot}
                options={KEY_OPTIONS}
                ariaLabel={`指板 ${props.index} 的根音`}
              />
              <Select
                value={board.chordId}
                onChange={props.onSelectChord}
                options={CHORD_OPTIONS}
                ariaLabel={`指板 ${props.index} 的和弦类型`}
              />
            </>
          )}

          {(board.mode === 'explore' || (board.mode === 'chord' && props.chordSub === 'identify')) && (
            <button
              type="button"
              className="chip"
              onClick={props.onClearSelection}
              disabled={board.selection.length === 0}
              title="清空这块指板上的标记"
            >
              清空{board.selection.length > 0 ? ` (${board.selection.length})` : ''}
            </button>
          )}

          <button
            type="button"
            className="board-icon-btn"
            onClick={props.onDuplicate}
            title="复制这块指板（方便改一个参数做对比）"
            aria-label="复制指板"
          >
            ⧉
          </button>
          <button
            type="button"
            className="board-icon-btn is-danger"
            onClick={props.onRemove}
            disabled={!props.canRemove}
            title={props.canRemove ? '删除这块指板' : '每种模式至少保留一块指板'}
            aria-label="删除指板"
          >
            ×
          </button>
        </span>
      </header>

      <div className="board-card-body">
        <Fretboard
          tuning={tuning}
          startFret={startFret}
          fretCount={fretCount}
          marks={marks}
          interactive
          showStringNumbers={props.showStringNumbers}
          showStringNames={props.showStringNames}
          onCellClick={props.onCellClick}
          onCellHover={props.onCellHover}
          shadeRanges={shadeRanges}
          ariaLabel={title}
        />
      </div>
    </article>
  )
}
