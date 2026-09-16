/// <reference types="vite/client" />

/**
 * 交互命中测试 —— 在真实浏览器里跑，验证「点圆点本身能命中它所在的那一格」。
 *
 * 为什么必须有这个测试：
 * Fretboard 里圆点画在点击热区之上。SVG 中被填充的图形默认会捕获指针事件，
 * 一旦圆点开始吃事件，点击就停在没有 onClick 的圆点上，表现是「点不中音，
 * 只能点圆点旁边的缝隙」。这类 bug 类型检查抓不到、SSR 也能过，
 * 因为几何是完全同心的（两边坐标一模一样），只有在有真实布局和命中测试的
 * 浏览器里才暴露得出来。
 *
 * 判定用 document.elementFromPoint —— 它走的就是真实点击的命中逻辑。
 *
 * 全程用 flushSync 同步完成，不依赖定时器：这样 `chrome --dump-dom` 在
 * load 事件时就能直接读到结果，不需要 --virtual-time-budget 之类的等待技巧。
 */

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { Fretboard, type FretMark, type MarkVariant } from '../src/components/Fretboard'
import { TUNING_BY_ID } from '../src/theory/tunings'
import '../src/styles.css'

const std = TUNING_BY_ID['standard-e']
const FRET_COUNT = 12
const DENSE_VARIANTS: MarkVariant[] = ['muted', 'tone', 'root', 'selected', 'ghost']

/** 密集分布：每一格都有圆点，最容易被吃掉事件的情况 */
function buildDenseMarks(): FretMark[] {
  const out: FretMark[] = []
  const frets = [0]
  for (let f = 1; f <= FRET_COUNT; f++) frets.push(f)
  for (const f of frets) {
    for (let s = 0; s < std.strings.length; s++) {
      out.push({
        stringIdx: s,
        fret: f,
        label: 'X',
        sub: 'y',
        variant: DENSE_VARIANTS[(s + f) % DENSE_VARIANTS.length],
        title: `${s}-${f}`,
      })
    }
  }
  return out
}

const DENSE = buildDenseMarks()
const SPARSE: FretMark[] = [
  { stringIdx: 0, fret: 3, label: 'G', variant: 'root' },
  { stringIdx: 2, fret: 5, label: 'D', variant: 'tone' },
  { stringIdx: 3, fret: 0, label: 'G', variant: 'selected' },
  { stringIdx: 5, fret: 12, label: 'E', variant: 'ghost' },
]

const notes: string[] = []
const failures: string[] = []
let checkCount = 0

function describeEl(el: Element | null): string {
  if (!el) return 'null（该点不可命中）'
  const cls = el.getAttribute('class') ?? ''
  const ds = el.getAttribute('data-string')
  const df = el.getAttribute('data-fret')
  return `<${el.tagName.toLowerCase()} class="${cls}">${ds !== null && df !== null ? `[${ds}弦${df}品]` : ''}`
}

function Harness() {
  const [dense, setDense] = useState(0)
  const [sparse, setSparse] = useState(0)
  return (
    <div>
      <div style={{ width: 1160, padding: '12px 16px' }}>
        <div id="dense-wrap">
          <Fretboard
            tuning={std}
            startFret={0}
            fretCount={FRET_COUNT}
            marks={DENSE}
            interactive
            onCellClick={() => setDense((n) => n + 1)}
          />
        </div>
      </div>
      <div style={{ width: 1160, padding: '12px 16px' }}>
        <div id="sparse-wrap">
          <Fretboard
            tuning={std}
            startFret={0}
            fretCount={FRET_COUNT}
            marks={SPARSE}
            interactive
            onCellClick={() => setSparse((n) => n + 1)}
          />
        </div>
      </div>
      {/* 计数暴露到 DOM 属性上，测试直接读，避免依赖闭包变量 */}
      <div id="click-log" data-dense={dense} data-sparse={sparse} />
    </div>
  )
}

function clickedCount(which: 'dense' | 'sparse'): number {
  const el = document.getElementById('click-log')
  return Number(el?.getAttribute(`data-${which}`) ?? '-1')
}

function visible(x: number, y: number): boolean {
  return x >= 1 && y >= 1 && x <= window.innerWidth - 1 && y <= window.innerHeight - 1
}

/** 探测一块指板：每个圆点的中心与四周都必须落到它自己那一格的热区上 */
function probeSvg(svg: SVGSVGElement, label: string): void {
  const groups = [...svg.querySelectorAll<SVGGElement>('g.fb-note')]
  if (groups.length === 0) {
    failures.push(`${label}：指板上没有任何圆点，测试无效`)
    return
  }

  for (const g of groups) {
    const circle = g.querySelector('circle.fb-note-body')
    if (!circle) continue
    const box = circle.getBoundingClientRect()
    const cx = box.left + box.width / 2
    const cy = box.top + box.height / 2
    const rad = box.width / 2
    const wantS = g.getAttribute('data-string')
    const wantF = g.getAttribute('data-fret')
    const where = `${wantS}弦${wantF}品`

    const probes = [
      { x: cx, y: cy, label: '圆心' },
      { x: cx, y: cy - rad * 0.7, label: '圆点上部' },
      { x: cx, y: cy + rad * 0.7, label: '圆点下部' },
      { x: cx - rad * 0.7, y: cy, label: '圆点左侧' },
      { x: cx + rad * 0.7, y: cy, label: '圆点右侧' },
    ]

    for (const p of probes) {
      if (!visible(p.x, p.y)) continue
      checkCount++

      const el = document.elementFromPoint(p.x, p.y)
      const hit = el?.closest?.('.fb-hit') as SVGRectElement | null
      if (!hit) {
        failures.push(`${label} — ${where} ${p.label}：命中 ${describeEl(el)}，没有落到 .fb-hit 热区上`)
        continue
      }
      const gotS = hit.getAttribute('data-string')
      const gotF = hit.getAttribute('data-fret')
      if (gotS !== wantS || gotF !== wantF) {
        failures.push(`${label} — ${where} ${p.label}：落到了 ${gotS}弦${gotF}品 的热区`)
      }
    }
  }
  notes.push(`  · ${label}：探测 ${groups.length} 个圆点`)
}

/** 在首个圆点的正中心派发一次真实冒泡 click，返回该圆点的坐标标签 */
function clickFirstDotCenter(svg: SVGSVGElement): string | null {
  const g = svg.querySelector<SVGGElement>('g.fb-note')
  const circle = g?.querySelector('circle.fb-note-body')
  if (!g || !circle) return null
  const box = circle.getBoundingClientRect()
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  if (!visible(cx, cy)) return null

  const target = document.elementFromPoint(cx, cy)
  if (!target) return null
  flushSync(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  return `${g.getAttribute('data-string')}-${g.getAttribute('data-fret')}`
}

function report(failed: boolean): void {
  const body = [
    'Fretboard 交互命中测试',
    '',
    ...notes,
    '',
    `有效探测点：${checkCount}`,
    `失败：${failures.length}`,
  ]
  if (failures.length) {
    body.push('')
    for (const f of failures.slice(0, 40)) body.push(`  ✗ ${f}`)
    if (failures.length > 40) body.push(`  … 还有 ${failures.length - 40} 条`)
  }
  body.push('', failed ? 'RESULT: FAIL' : 'RESULT: PASS')

  const el = document.getElementById('result')
  if (el) el.textContent = body.join('\n')
  document.title = failed ? 'FAIL' : 'PASS'
  document.body.setAttribute('data-test', failed ? 'FAIL' : 'PASS')
}

// ── 主流程：全同步，不留任何异步尾巴 ──────────────────────

try {
  const root = document.getElementById('test-root')
  if (!root) throw new Error('#test-root 不存在')

  // flushSync 强制同步 render + commit，DOM 立刻可用
  flushSync(() => {
    createRoot(root).render(<Harness />)
  })

  const totalDots = document.querySelectorAll('svg.fretboard circle.fb-note-body').length
  const expectedDots = DENSE.length + SPARSE.length
  if (totalDots !== expectedDots) {
    failures.push(`渲染似乎没完成：找到 ${totalDots} 个圆点，期望 ${expectedDots} 个`)
  } else {
    for (const [label, wrapId, which] of [
      ['密集标记（每格都有圆点）', 'dense-wrap', 'dense'],
      ['稀疏标记（只有 4 个圆点）', 'sparse-wrap', 'sparse'],
    ] as const) {
      const svg = document.getElementById(wrapId)?.querySelector('svg.fretboard') as SVGSVGElement | null
      if (!svg) {
        failures.push(`${label}：找不到 svg.fretboard`)
        continue
      }

      probeSvg(svg, label)

      const before = clickedCount(which)
      const expected = clickFirstDotCenter(svg)
      checkCount++
      if (expected === null) {
        notes.push(`  · ${label}：首个圆点不在视口内，跳过真实点击验证`)
      } else if (clickedCount(which) !== before + 1) {
        failures.push(`${label}：在 ${expected} 的圆心派发 click 后，onCellClick 没有触发`)
      } else {
        notes.push(`  · ${label}：点击圆心 → onCellClick 正常触发（${expected}）`)
      }
    }
  }
} catch (e) {
  failures.push(`测试脚本抛异常：${(e as Error).message}`)
}

report(failures.length > 0)
