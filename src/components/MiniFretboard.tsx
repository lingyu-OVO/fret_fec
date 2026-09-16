import type { Tuning } from '../theory/tunings'
import { stringLabel } from '../theory/tunings'

/**
 * 小指型图：和弦图的标准画法是「弦竖直、低音弦在左、琴枕在上」，
 * 和最上方的主指板（弦水平）方向不同，这里刻意区分，避免用户读错。
 */

const GAP = 21
const ROW = 25
const PAD_L = 16
const PAD_R = 16
const PAD_T = 30
const PAD_B = 16
const DOT_R = 8

export interface MiniFretboardProps {
  tuning: Tuning
  /** 每根弦的品位，null = 闷音，0 = 空弦；低音弦 → 高音弦 */
  frets: (number | null)[]
  /** 每个发声弦的和弦音级标签（可选） */
  degrees?: (string | null)[]
  /** 根音所在的音级标签，用于高亮 */
  rootDegree?: string
  /** 显示弦号 */
  showStringLabels?: boolean
  className?: string
}

export function MiniFretboard({
  tuning,
  frets,
  degrees,
  rootDegree = '1',
  showStringLabels = true,
  className,
}: MiniFretboardProps) {
  const n = frets.length
  const fretted = frets.filter((f): f is number => f !== null && f > 0)

  let displayStart: number
  let rows: number
  if (fretted.length === 0) {
    displayStart = 1
    rows = 4
  } else {
    const minF = Math.min(...fretted)
    const maxF = Math.max(...fretted)
    if (minF <= 2) {
      displayStart = 1
      rows = Math.min(5, Math.max(4, maxF))
    } else {
      displayStart = minF
      rows = Math.min(5, Math.max(3, maxF - minF + 1))
    }
  }

  const width = PAD_L + (n - 1) * GAP + PAD_R
  const height = PAD_T + rows * ROW + PAD_B
  const xOf = (s: number) => PAD_L + s * GAP
  const top = PAD_T
  const bottom = PAD_T + rows * ROW
  const hasNut = displayStart === 1

  /** 品位 f 的圆点纵坐标 */
  const yOfFret = (f: number) => top + (f - displayStart + 0.5) * ROW

  return (
    <svg
      className={`mini-fretboard${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`指型图 ${frets.map((f) => (f === null ? 'x' : f)).join('-')}`}
    >
      {/* 琴枕 */}
      {hasNut && <line className="mini-nut" x1={PAD_L - 4} y1={top} x2={width - PAD_R + 4} y2={top} strokeWidth={5} strokeLinecap="round" />}

      {/* 品丝 */}
      {Array.from({ length: rows + 1 }, (_, i) => (
        <line
          key={`w${i}`}
          className="mini-fret"
          x1={PAD_L - 2}
          y1={top + i * ROW}
          x2={width - PAD_R + 2}
          y2={top + i * ROW}
          strokeWidth={hasNut && i === 0 ? 0 : 1.2}
        />
      ))}

      {/* 弦 */}
      {frets.map((_, s) => (
        <line
          key={`s${s}`}
          className="mini-string"
          x1={xOf(s)}
          y1={top}
          x2={xOf(s)}
          y2={bottom}
          strokeWidth={0.9 + (n - 1 - s) * 0.22}
          strokeLinecap="round"
        />
      ))}

      {/* 起始品位标注 */}
      {!hasNut && (
        <text x={PAD_L - 6} y={top + ROW * 0.75} className="mini-start" textAnchor="end">
          {displayStart}
        </text>
      )}

      {/* 品位数字（左侧） */}
      {!hasNut && (
        <text x={PAD_L - 2} y={top + ROW * 0.75} className="mini-start-unit" textAnchor="end">
          fr
        </text>
      )}

      {/* 空弦 / 闷音 标记 */}
      {frets.map((f, s) => {
        if (f !== null && f > 0) return null
        const x = xOf(s)
        const y = top - 13
        if (f === 0) {
          return <circle key={`o${s}`} className="mini-open" cx={x} cy={y} r={4.5} strokeWidth={1.6} />
        }
        return (
          <g key={`x${s}`} className="mini-mute" strokeWidth={1.6} strokeLinecap="round">
            <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} />
            <line x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} />
          </g>
        )
      })}

      {/* 按弦点 */}
      {frets.map((f, s) => {
        if (f === null || f === 0) return null
        const deg = degrees?.[s] ?? null
        const isRoot = deg !== null && deg === rootDegree
        return (
          <g key={`d${s}`} className={`mini-dot${isRoot ? ' is-root' : ''}`}>
            <circle className="mini-dot-body" cx={xOf(s)} cy={yOfFret(f)} r={DOT_R} strokeWidth={1.2} />
            {deg && (
              <text x={xOf(s)} y={yOfFret(f)} className="mini-deg" textAnchor="middle" dominantBaseline="middle">
                {deg}
              </text>
            )}
          </g>
        )
      })}

      {/* 弦号 */}
      {showStringLabels &&
        frets.map((_, s) => (
          <text key={`l${s}`} x={xOf(s)} y={height - 4} className="mini-stringlabel" textAnchor="middle">
            {stringLabel(tuning, s)}
          </text>
        ))}
    </svg>
  )
}

/** 指型文本，如 x32010 */
export function fretText(frets: (number | null)[]): string {
  return frets.map((f) => (f === null ? 'x' : String(f))).join(' ')
}
