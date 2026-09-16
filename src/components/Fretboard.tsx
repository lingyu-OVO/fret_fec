import { useMemo, useState } from 'react'
import type { Tuning } from '../theory/tunings'
import { fretMarkers, openStringName, stringLabel } from '../theory/tunings'

/**
 * 指板几何常量。
 * 逻辑坐标系固定，靠 viewBox + CSS 宽度 100% 自适应，
 * 所有尺寸都用同一套单位，缩放不会变形，也不用监听 resize。
 */
const STRING_GAP = 64
const FRET_GAP = 84
const PAD_LEFT = 92
const PAD_RIGHT = 30
const PAD_TOP = 34
const PAD_BOTTOM = 54
const OPEN_W = 64

/**
 * 圆点半径按变体分层：
 *   · 主层（选中 / 主音 / 音阶内音 / 和弦音）用大圆，里面放「音级 + 音名」两行
 *   · 底图层（全部音名 / 音阶外音 / 和弦音分布图）用小圆，避免喧宾夺主
 */
export type MarkVariant = 'root' | 'tone' | 'selected' | 'muted' | 'ghost'

const R_MAIN = 25
const R_BASE = 18

export function radiusForVariant(v: MarkVariant): number {
  return v === 'muted' || v === 'ghost' ? R_BASE : R_MAIN
}

export interface FretMark {
  stringIdx: number
  fret: number
  /** 圆点内主标签（音级优先，如 '1' 'b3' '5'） */
  label?: string
  /** 主标签下方的小字（音名，如 'C' 'Eb' 'G'） */
  sub?: string
  variant: MarkVariant
  /** SVG title，供无障碍工具读取 */
  title?: string
}

export interface FretboardProps {
  tuning: Tuning
  /** 起始品位：0 表示从空弦/琴枕开始画 */
  startFret: number
  /** 显示多少品 */
  fretCount: number
  marks: FretMark[]
  onCellClick?: (stringIdx: number, fret: number) => void
  onCellHover?: (cell: { stringIdx: number; fret: number } | null) => void
  /** 是否可点击 */
  interactive?: boolean
  /** 显示左侧弦号（6~1） */
  showStringNumbers?: boolean
  /** 显示左侧空弦音名（E A D G B E） */
  showStringNames?: boolean
  /** 只高亮这些弦，其余变暗（null = 全部正常） */
  activeStrings?: number[] | null
  /** 需要压暗的品位区间（用于「只看某个把位」） */
  shadeRanges?: { from: number; to: number }[]
  ariaLabel?: string
}

export function Fretboard({
  tuning,
  startFret,
  fretCount,
  marks,
  onCellClick,
  onCellHover,
  interactive = false,
  showStringNumbers = true,
  showStringNames = true,
  activeStrings = null,
  shadeRanges,
  ariaLabel,
}: FretboardProps) {
  const [hover, setHover] = useState<{ stringIdx: number; fret: number } | null>(null)

  const n = tuning.strings.length
  const hasNut = startFret === 0
  const openW = hasNut ? OPEN_W : 0
  const boardLeft = PAD_LEFT + openW
  const boardRight = boardLeft + fretCount * FRET_GAP
  const boardTop = PAD_TOP - 28
  const boardBottom = PAD_TOP + (n - 1) * STRING_GAP + 28
  const width = boardRight + PAD_RIGHT
  const height = boardBottom + PAD_BOTTOM

  const yOf = (s: number) => PAD_TOP + (n - 1 - s) * STRING_GAP
  const firstShown = hasNut ? 1 : startFret
  const xOfFret = (f: number) =>
    f === 0 ? PAD_LEFT + OPEN_W / 2 : boardLeft + (f - firstShown) * FRET_GAP + FRET_GAP / 2

  const markers = useMemo(() => fretMarkers(startFret, fretCount), [startFret, fretCount])
  const fretsShown = useMemo(() => {
    const list: number[] = []
    if (hasNut) list.push(0)
    for (let f = firstShown; f < firstShown + fretCount; f++) list.push(f)
    return list
  }, [hasNut, firstShown, fretCount])

  const active = activeStrings ? new Set(activeStrings) : null
  const stringLineW = (s: number) => 1.4 + (n - 1 - s) * 0.42

  return (
    <svg
      className="fretboard"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel ?? '吉他指板'}
    >
      <defs>
        <linearGradient id="fb-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="fb-wood-a" />
          <stop offset="45%" className="fb-wood-b" />
          <stop offset="100%" className="fb-wood-c" />
        </linearGradient>
        <linearGradient id="fb-string" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" className="fb-str-a" />
          <stop offset="35%" className="fb-str-b" />
          <stop offset="65%" className="fb-str-c" />
          <stop offset="100%" className="fb-str-d" />
        </linearGradient>
        <linearGradient id="fb-nut" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" className="fb-nut-a" />
          <stop offset="50%" className="fb-nut-b" />
          <stop offset="100%" className="fb-nut-c" />
        </linearGradient>
        <filter id="fb-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 左侧弦栏的底色，让弦号/音名在视觉上明确「属于指板」 */}
      <rect
        className="fb-gutter"
        x={0}
        y={boardTop}
        width={boardLeft}
        height={boardBottom - boardTop}
      />

      {/* 指板木料 */}
      <rect
        x={boardLeft}
        y={boardTop}
        width={boardRight - boardLeft}
        height={boardBottom - boardTop}
        rx={5}
        fill="url(#fb-wood)"
      />
      <rect
        className="fb-board-edge"
        x={boardLeft}
        y={boardTop}
        width={boardRight - boardLeft}
        height={boardBottom - boardTop}
        rx={5}
        fill="none"
      />

      {/* 压暗区间 */}
      {(shadeRanges ?? []).map((r, i) => {
        const from = Math.max(r.from, hasNut ? 1 : firstShown)
        const to = Math.min(r.to, firstShown + fretCount - 1)
        if (to < from) return null
        const x1 = r.from <= (hasNut ? 0 : firstShown) ? boardLeft : boardLeft + (from - firstShown) * FRET_GAP
        const x2 = to >= firstShown + fretCount - 1 ? boardRight : boardLeft + (to - firstShown + 1) * FRET_GAP
        return (
          <rect
            key={`shade-${i}`}
            className="fb-shade"
            x={x1}
            y={boardTop}
            width={Math.max(0, x2 - x1)}
            height={boardBottom - boardTop}
            pointerEvents="none"
          />
        )
      })}

      {/* 品丝 */}
      {Array.from({ length: fretCount + 1 }, (_, j) => {
        const x = boardLeft + j * FRET_GAP
        const isNut = hasNut && j === 0
        return (
          <line
            key={`wire-${j}`}
            x1={x}
            y1={boardTop}
            x2={x}
            y2={boardBottom}
            className={isNut ? 'fb-nutline' : 'fb-fretline'}
            strokeWidth={isNut ? 9 : 2.5}
            strokeLinecap="round"
          />
        )
      })}

      {/* 品位记号 */}
      {markers.map((m) => {
        const x = xOfFret(m.fret)
        if (m.double) {
          return (
            <g key={`mark-${m.fret}`}>
              <circle className="fb-inlay" cx={x} cy={boardTop + (boardBottom - boardTop) * 0.32} r={5.5} />
              <circle className="fb-inlay" cx={x} cy={boardTop + (boardBottom - boardTop) * 0.68} r={5.5} />
            </g>
          )
        }
        return (
          <circle
            key={`mark-${m.fret}`}
            className="fb-inlay"
            cx={x}
            cy={boardTop + (boardBottom - boardTop) / 2}
            r={5.5}
          />
        )
      })}

      {/* 琴弦 */}
      {tuning.strings.map((_, s) => {
        const dim = active ? !active.has(s) : false
        return (
          <line
            key={`str-${s}`}
            x1={boardLeft}
            y1={yOf(s)}
            x2={boardRight}
            y2={yOf(s)}
            stroke="url(#fb-string)"
            strokeWidth={stringLineW(s)}
            strokeLinecap="round"
            opacity={dim ? 0.22 : 1}
          />
        )
      })}

      {/* 空弦区（弦枕左侧）也画一段弦，让 0 品有归属感 */}
      {hasNut &&
        tuning.strings.map((_, s) => {
          const dim = active ? !active.has(s) : false
          return (
            <line
              key={`open-${s}`}
              x1={boardLeft - openW + 4}
              y1={yOf(s)}
              x2={boardLeft - 4}
              y2={yOf(s)}
              stroke="url(#fb-string)"
              strokeWidth={stringLineW(s)}
              opacity={dim ? 0.12 : 0.42}
              strokeLinecap="round"
            />
          )
        })}

      {/* 点击热区 */}
      {interactive &&
        fretsShown.map((f) =>
          tuning.strings.map((_, s) => {
            const dim = active ? !active.has(s) : false
            if (dim) return null
            const isOpen = f === 0
            const x = isOpen ? PAD_LEFT : boardLeft + (f - firstShown) * FRET_GAP
            const w = isOpen ? openW : FRET_GAP
            return (
              <rect
                key={`hit-${s}-${f}`}
                className="fb-hit"
                data-string={s}
                data-fret={f}
                x={x}
                y={yOf(s) - STRING_GAP / 2}
                width={w}
                height={STRING_GAP}
                fill="transparent"
                onClick={() => onCellClick?.(s, f)}
                onMouseEnter={() => {
                  setHover({ stringIdx: s, fret: f })
                  onCellHover?.({ stringIdx: s, fret: f })
                }}
                onMouseLeave={() => {
                  setHover(null)
                  onCellHover?.(null)
                }}
              />
            )
          }),
        )}

      {/* 悬停幽灵点 */}
      {interactive && hover && !marks.some((m) => m.stringIdx === hover.stringIdx && m.fret === hover.fret) && (
        <circle
          className="fb-hover-ring"
          cx={xOfFret(hover.fret)}
          cy={yOf(hover.stringIdx)}
          r={R_MAIN}
          fill="none"
          strokeWidth={2}
          strokeDasharray="4 4"
          pointerEvents="none"
        />
      )}

      {/* 音符标记 */}
      {marks.map((m) => {
        const cx = xOfFret(m.fret)
        const cy = yOf(m.stringIdx)
        const r = radiusForVariant(m.variant)
        const dim = active ? !active.has(m.stringIdx) : false
        const twoLine = Boolean(m.sub)
        return (
          <g
            key={`note-${m.stringIdx}-${m.fret}`}
            className={`fb-note fb-${m.variant}${twoLine ? ' fb-two-line' : ''}`}
            data-string={m.stringIdx}
            data-fret={m.fret}
            opacity={dim ? 0.2 : 1}
          >
            {m.title && <title>{m.title}</title>}
            <circle
              cx={cx}
              cy={cy}
              r={r}
              className="fb-note-body"
              filter={m.variant === 'root' ? 'url(#fb-glow)' : undefined}
            />
            {m.label && (
              <text
                x={cx}
                y={twoLine ? cy - 8 : cy}
                className="fb-note-label"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {m.label}
              </text>
            )}
            {m.sub && (
              <text
                x={cx}
                y={cy + 13}
                className="fb-note-sub"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {m.sub}
              </text>
            )}
          </g>
        )
      })}

      {/* 品位数字 */}
      {fretsShown
        .filter((f) => f > 0)
        .map((f) => (
          <text
            key={`num-${f}`}
            x={xOfFret(f)}
            y={boardBottom + 26}
            className={`fb-fretnum${f === 12 || f === 24 ? ' fb-fretnum-strong' : ''}`}
            textAnchor="middle"
          >
            {f}
          </text>
        ))}

      {/* 弦号 + 空弦音名：放在左侧独立弦栏里，和圆点区域完全分开，任何情况下都不重叠 */}
      {tuning.strings.map((_, s) => {
        const dim = active ? !active.has(s) : false
        const w = stringLineW(s)
        return (
          <g key={`label-${s}`} className="fb-stringlabel" opacity={dim ? 0.25 : 1}>
            {showStringNumbers && (
              <text
                x={PAD_LEFT - 58}
                y={yOf(s)}
                className="fb-stringnum"
                textAnchor="middle"
                dominantBaseline="middle"
                data-string={s}
              >
                {stringLabel(tuning, s)}
              </text>
            )}
            {showStringNames && (
              <text
                x={showStringNumbers ? PAD_LEFT - 26 : PAD_LEFT - 40}
                y={yOf(s)}
                className="fb-stringname"
                textAnchor="middle"
                dominantBaseline="middle"
                data-string={s}
              >
                {openStringName(tuning, s, false)}
              </text>
            )}
            {/* 弦栏到指板的引导线，强调「这一行属于这根弦」 */}
            <line
              className="fb-stringtick"
              x1={PAD_LEFT - 10}
              y1={yOf(s)}
              x2={boardLeft - (hasNut ? openW : 0) + 8}
              y2={yOf(s)}
              strokeWidth={w}
              strokeLinecap="round"
            />
          </g>
        )
      })}
    </svg>
  )
}
