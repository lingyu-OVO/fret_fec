/// <reference types="vite/client" />

/**
 * visual.tsx — 在真实浏览器里做「不靠眼睛」的视觉检验
 *
 * 为什么需要它：这个环境里没有视觉模型，看不到截图。
 * 所以把「看着对不对」翻译成可计算的量：
 *
 *   ① 主题是否真的生效 —— 读 getComputedStyle 的背景色亮度
 *   ② 文字能不能看清   —— 算 WCAG 对比度（含 alpha 合成后的实际背景）
 *   ③ 有没有重叠/裁切   —— 用 getBoundingClientRect 做几何判定
 *   ④ 多指板逻辑对不对 —— 在真实 DOM 上点「添加指板」，数卡片
 *
 * 全程 flushSync 同步完成，chrome --dump-dom 在 load 时就能读到结果。
 */

import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import { Fretboard, type FretMark } from '../src/components/Fretboard'
import { TUNING_BY_ID } from '../src/theory/tunings'
import '../src/styles.css'

const STD = TUNING_BY_ID['standard-e']

/**
 * 五种圆点变体的对照样本。
 * 单独渲染一份，因为 App 一次只会出现其中几种（探索模式只有 muted/selected，
 * 音阶模式只有 root/tone/ghost），靠 App 覆盖不全。
 */
const FIXTURE_MARKS: FretMark[] = [
  { stringIdx: 0, fret: 1, label: '1', sub: 'C', variant: 'root' },
  { stringIdx: 1, fret: 1, label: '3', sub: 'E', variant: 'tone' },
  { stringIdx: 2, fret: 1, label: '5', sub: 'G', variant: 'selected' },
  { stringIdx: 3, fret: 1, label: 'C', variant: 'muted' },
  { stringIdx: 4, fret: 1, label: 'b7', variant: 'ghost' },
]

// ── 颜色工具 ─────────────────────────────────────────────

type RGBA = [number, number, number, number]

/**
 * 解析计算样式里的颜色。
 * 必须同时支持十六进制（CSS 变量原样读出时是 #rrggbb）和 rgb()/rgba()，
 * 只认 rgb() 的话，拿变量当背景会解析成「全透明黑」，对比度就全错了。
 */
function parseColor(input: string): RGBA {
  const s = (input ?? '').trim()

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    if (h.length === 6) h += 'ff'
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      parseInt(h.slice(6, 8), 16) / 255,
    ]
  }

  const m = /rgba?\(([^)]+)\)/.exec(s)
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p.length > 3 ? (p[3] ?? 1) : 1]
  }

  const srgb = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/.exec(s)
  if (srgb) {
    return [
      Number(srgb[1]) * 255,
      Number(srgb[2]) * 255,
      Number(srgb[3]) * 255,
      srgb[4] !== undefined ? Number(srgb[4]) : 1,
    ]
  }

  return [0, 0, 0, 0]
}

function over(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3] + bg[3] * (1 - fg[3])
  if (a === 0) return [0, 0, 0, 0]
  const mix = (i: number) => (fg[i] * fg[3] + bg[i] * bg[3] * (1 - fg[3])) / a
  return [mix(0), mix(1), mix(2), a]
}

function luminance(c: RGBA): number {
  const f = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}

function contrast(a: RGBA, b: RGBA): number {
  const la = luminance(a)
  const lb = luminance(b)
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** 元素的实际背景：向上收集背景色并逐层 alpha 合成 */
function effectiveBg(el: Element): RGBA {
  const stack: RGBA[] = []
  let cur: Element | null = el
  while (cur) {
    const c = parseColor(getComputedStyle(cur).backgroundColor)
    if (c[3] > 0) stack.push(c)
    if (c[3] >= 1) break
    cur = cur.parentElement
  }
  let acc: RGBA = [255, 255, 255, 1]
  for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc)
  return acc
}

function cssVar(name: string): RGBA {
  return parseColor(getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'rgba(0,0,0,0)')
}

/**
 * 关掉所有过渡再切主题。
 * body 上有 0.25s 的颜色过渡，不关掉的话 getComputedStyle 读到的是动画中间态
 * （会得到「文字是纯黑」这种明显失真的结果），对比度就没意义了。
 */
let frozen = false
function setThemeInstant(t: 'dark' | 'light'): void {
  if (!frozen) {
    const style = document.createElement('style')
    style.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }'
    document.head.appendChild(style)
    frozen = true
  }
  document.documentElement.dataset.theme = t
  // 强制重排，确保新变量已经生效
  void document.body.offsetHeight
  void document.documentElement.offsetHeight
}

// ── 结果收集 ─────────────────────────────────────────────

const notes: string[] = []
const failures: string[] = []
let checks = 0

function ok(label: string, cond: boolean, detail = ''): void {
  checks++
  if (!cond) failures.push(`${label}${detail ? `\n      ${detail}` : ''}`)
}

function section(title: string): void {
  notes.push('', `── ${title} ──`)
}

// ── 点击辅助 ─────────────────────────────────────────────

function findByText(selector: string, text: string): HTMLElement | null {
  const all = [...document.querySelectorAll<HTMLElement>(selector)]
  return all.find((el) => (el.textContent ?? '').includes(text)) ?? null
}

function click(el: HTMLElement | null): boolean {
  if (!el) return false
  flushSync(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
  })
  return true
}

/**
 * 改 <select> 的值并触发 React 的 onChange。
 *
 * 不能直接写 el.value = x：React 在 select/input 上挂了 value tracker，
 * 它判断「值没变化」就不会派发 change，测试会静默地什么都不发生（假通过）。
 * 必须取原型上的原生 setter 绕开 tracker。
 */
function setSelectValue(el: HTMLSelectElement | null, value: string): boolean {
  if (!el) return false
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  flushSync(() => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
  return true
}

function sel<T extends Element = HTMLElement>(q: string): T | null {
  return document.querySelector<T>(q)
}

function all<T extends Element = HTMLElement>(q: string): T[] {
  return [...document.querySelectorAll<T>(q)]
}

// ── 对比度矩阵 ───────────────────────────────────────────

interface ContrastCase {
  label: string
  selector: string
  /** 该元素文字下方的实际底色；不传则自动向上合成 */
  bg?: () => RGBA
  tier: 'primary' | 'secondary'
}

const CONTRAST_CASES: ContrastCase[] = [
  { label: '品牌主标题', selector: '.brand-text b', tier: 'primary' },
  // 渐变背景的背景色是 transparent，读不出真实底色，所以显式给最亮的那一端做最坏情况检验
  { label: '模式标签（选中）', selector: '.mode-tab.is-active', bg: () => cssVar('--tab-grad-a'), tier: 'primary' },
  { label: '模式标签（未选中）', selector: '.mode-tab:not(.is-active)', tier: 'primary' },
  { label: '指板卡片标题', selector: '.board-title', tier: 'primary' },
  { label: '指板卡片副标题', selector: '.board-title-sub', tier: 'secondary' },
  { label: '顶部提示条', selector: '.board-bar .hint', tier: 'secondary' },
  { label: '面板标题', selector: '.panel-title', tier: 'primary' },
  { label: '面板副标题', selector: '.panel-sub', tier: 'secondary' },
  { label: '面板正文说明', selector: '.panel-foot', tier: 'secondary' },
  { label: '开关文字', selector: '.switch .switch-label', tier: 'primary' },
  { label: '字段标签', selector: '.field-label', tier: 'primary' },
  { label: '添加指板按钮', selector: '.board-add', tier: 'secondary' },
  {
    label: '指板弦名（左栏）',
    selector: '.fb-stringname',
    bg: () => over(cssVar('--fb-gutter'), effectiveBg(sel('.board-card')!)),
    tier: 'primary',
  },
  {
    label: '指板弦号（左栏）',
    selector: '.fb-stringnum',
    bg: () => over(cssVar('--fb-gutter'), effectiveBg(sel('.board-card')!)),
    tier: 'secondary',
  },
  {
    label: '品位数字',
    selector: '.fb-fretnum',
    bg: () => over(cssVar('--fb-gutter'), effectiveBg(sel('.board-card')!)),
    tier: 'secondary',
  },
]

/** 圆点里的文字：底色 = 圆点填充色 alpha 合成到木料上 */
function dotBg(variant: string): () => RGBA {
  return () => {
    const dot = sel(`#dot-fixture .fb-${variant} .fb-note-body`)
    if (!dot) return [0, 0, 0, 0]
    return over(parseColor(getComputedStyle(dot).fill), cssVar('--fb-wood-b'))
  }
}

const DOT_CONTRAST_CASES: ContrastCase[] = [
  { label: '圆点·主音 音级', selector: '#dot-fixture .fb-root .fb-note-label', bg: dotBg('root'), tier: 'primary' },
  { label: '圆点·主音 音名', selector: '#dot-fixture .fb-root .fb-note-sub', bg: dotBg('root'), tier: 'primary' },
  { label: '圆点·音阶内音 音级', selector: '#dot-fixture .fb-tone .fb-note-label', bg: dotBg('tone'), tier: 'primary' },
  { label: '圆点·音阶内音 音名', selector: '#dot-fixture .fb-tone .fb-note-sub', bg: dotBg('tone'), tier: 'primary' },
  { label: '圆点·已选中 音级', selector: '#dot-fixture .fb-selected .fb-note-label', bg: dotBg('selected'), tier: 'primary' },
  { label: '圆点·底图音名', selector: '#dot-fixture .fb-muted .fb-note-label', bg: dotBg('muted'), tier: 'secondary' },
  { label: '圆点·音阶外音', selector: '#dot-fixture .fb-ghost .fb-note-label', bg: dotBg('ghost'), tier: 'secondary' },
]

function checkContrast(theme: string): void {
  section(`对比度（${theme}）`)
  // 先把主题切到位并冻结过渡，再开始量
  setThemeInstant(theme as 'dark' | 'light')
  notes.push(`  · --bg=${getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()} --text=${getComputedStyle(document.documentElement).getPropertyValue('--text').trim()}`)

  for (const c of [...CONTRAST_CASES, ...DOT_CONTRAST_CASES]) {
    const el = sel(c.selector)
    if (!el) {
      ok(`对比度·${c.label}`, false, `找不到元素 ${c.selector}`)
      continue
    }
    const fgRaw = el instanceof SVGElement ? getComputedStyle(el).fill : getComputedStyle(el).color
    const fg = parseColor(fgRaw)
    if (fg[3] === 0) {
      ok(`对比度·${c.label}`, false, `文字颜色解析失败: ${fgRaw}`)
      continue
    }
    const bg = c.bg ? c.bg() : effectiveBg(el)
    const text = over(fg, bg)
    const ratio = contrast(text, bg)
    const min = c.tier === 'primary' ? 4.5 : 3
    const pass = ratio >= min
    ok(`对比度 ${ratio.toFixed(2)}:1 ≥ ${min} — ${c.label}`, pass, `文字 ${fgRaw} 底 ${bg.slice(0, 3).map(Math.round).join(',')}`)
    notes.push(`  ${pass ? '·' : '✗'} ${ratio.toFixed(2).padStart(5)}:1  ${c.label}`)
  }
}

// ── 几何检验 ─────────────────────────────────────────────

function rectOf(el: Element): DOMRect {
  return el.getBoundingClientRect()
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)
}

function checkGeometry(): void {
  section('几何：弦栏不与圆点重叠 / 标签在圆点内')

  const svg = sel<SVGSVGElement>('svg.fretboard')
  if (!svg) {
    ok('几何检查', false, '找不到 svg.fretboard')
    return
  }

  // ① 左侧弦号/弦名 不能和任何音符圆点重叠
  const labels = [...svg.querySelectorAll('.fb-stringname, .fb-stringnum')]
  const dots = [...svg.querySelectorAll('.fb-note-body')]
  ok('弦栏元素存在', labels.length > 0, `找到 ${labels.length} 个`)
  ok('圆点元素存在', dots.length > 0, `找到 ${dots.length} 个`)

  let overlaps = 0
  let worst = ''
  for (const l of labels) {
    const lr = rectOf(l)
    if (lr.width === 0 || lr.height === 0) continue
    for (const d of dots) {
      const dr = rectOf(d)
      if (intersects(lr, dr)) {
        overlaps++
        if (!worst) {
          worst = `${l.textContent} 与圆点(${d.parentElement?.getAttribute('data-string')}弦${d.parentElement?.getAttribute('data-fret')}品) 重叠`
        }
      }
    }
  }
  ok('弦号/弦名与音符圆点零重叠', overlaps === 0, `${overlaps} 处重叠${worst ? `，例如 ${worst}` : ''}`)

  // ② 圆点内两行文字必须都在圆内，且彼此不重叠
  let outside = 0
  let selfOverlap = 0
  let checkedDots = 0
  for (const g of svg.querySelectorAll<SVGGElement>('g.fb-note.fb-two-line')) {
    const circle = g.querySelector('.fb-note-body')
    const label = g.querySelector('.fb-note-label')
    const sub = g.querySelector('.fb-note-sub')
    if (!circle || !label || !sub) continue
    checkedDots++

    const cr = rectOf(circle)
    const cx = cr.left + cr.width / 2
    const cy = cr.top + cr.height / 2
    const r = cr.width / 2

    for (const t of [label, sub]) {
      const tr = rectOf(t)
      // 文字四角到圆心的距离都要 ≤ 半径
      const corners: [number, number][] = [
        [tr.left, tr.top],
        [tr.right, tr.top],
        [tr.left, tr.bottom],
        [tr.right, tr.bottom],
      ]
      const maxDist = Math.max(...corners.map(([x, y]) => Math.hypot(x - cx, y - cy)))
      if (maxDist > r) outside++
    }

    if (intersects(rectOf(label), rectOf(sub))) selfOverlap++
  }

  ok('存在双行圆点样本', checkedDots > 0, `检查了 ${checkedDots} 个`)
  ok('圆点内两行文字都在圆内', outside === 0, `${outside} 个文字角点越出圆边界`)
  ok('圆点内两行文字互不重叠', selfOverlap === 0, `${selfOverlap} 处上下行重叠`)

  // ③ 两行必须真的分两行
  if (checkedDots > 0) {
    const first = svg.querySelector('g.fb-note.fb-two-line')!
    const ly = Number(rectOf(first.querySelector('.fb-note-label')!).top)
    const sy = Number(rectOf(first.querySelector('.fb-note-sub')!).top)
    ok('音级在上、音名在下', sy > ly, `label.top=${ly.toFixed(1)} sub.top=${sy.toFixed(1)}`)
  }
}

// ── 主流程 ───────────────────────────────────────────────

const root = document.getElementById('test-root')

try {
  if (!root) throw new Error('#test-root 不存在')

  flushSync(() => {
    createRoot(root).render(
      <>
        <App />
        {/* 五种圆点变体的独立对照样本，保证每种都能量到对比度 */}
        <div id="dot-fixture" style={{ width: 880, padding: 12 }}>
          <Fretboard tuning={STD} startFret={0} fretCount={3} marks={FIXTURE_MARKS} />
        </div>
      </>,
    )
  })

  // ── ① 主题 ──
  section('主题切换')
  const initial = document.documentElement.dataset.theme
  ok('初始主题已落到 <html data-theme>', initial === 'dark' || initial === 'light', `实际 ${initial}`)
  notes.push(`  · 初始主题 ${initial}`)

  const btn = findByText('.chip', '白天') ?? findByText('.chip', '黑夜')
  ok('找到主题切换按钮', btn !== null)
  click(btn)

  const after = document.documentElement.dataset.theme
  ok('点击后主题确实翻转', after !== initial, `${initial} → ${after}`)
  notes.push(`  · 点击后 ${after}`)

  // 两套主题的底色与木料都要真的换过来
  for (const t of ['dark', 'light'] as const) {
    setThemeInstant(t)
    const bg = parseColor(getComputedStyle(document.body).backgroundColor)
    const lum = luminance(bg)
    const woodStop = sel('.fb-wood-b')
    const woodLum = woodStop ? luminance(parseColor(getComputedStyle(woodStop).stopColor)) : -1

    if (t === 'light') {
      ok('白天模式：页面底色为浅色', lum > 0.6, `亮度 ${lum.toFixed(3)}`)
      ok('白天模式：指板木料为浅色', woodLum > 0.45, `亮度 ${woodLum.toFixed(3)}`)
    } else {
      ok('黑夜模式：页面底色为深色', lum < 0.12, `亮度 ${lum.toFixed(3)}`)
      ok('黑夜模式：指板木料为深色', woodLum >= 0 && woodLum < 0.1, `亮度 ${woodLum.toFixed(3)}`)
    }
    notes.push(
      `  · ${t}：页面底色 rgb(${bg.slice(0, 3).map(Math.round).join(',')}) 亮度 ${lum.toFixed(3)}，指板木料亮度 ${woodLum.toFixed(3)}`,
    )
  }
  setThemeInstant(document.documentElement.dataset.theme as 'dark' | 'light')

  // ── ② 多指板：真的点按钮 ──
  section('多指板（真实点击驱动）')

  const scaleTab = findByText('.mode-tab', '音阶')
  ok('找到「音阶」模式标签', scaleTab !== null)
  click(scaleTab)

  const boardsAfterSwitch = all('.board-card').length
  ok('切到音阶模式后有 1 块指板', boardsAfterSwitch === 1, `实际 ${boardsAfterSwitch}`)
  notes.push(`  · 切到音阶模式：${boardsAfterSwitch} 块`)

  /** 量一块指板 SVG 的实际渲染尺寸 */
  const boardSize = (i: number) => {
    const svg = all('.board-card')[i]?.querySelector('svg.fretboard')
    if (!svg) return null
    const r = rectOf(svg)
    return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }
  const baseline = boardSize(0)
  ok('能量到单块指板的尺寸', baseline !== null, JSON.stringify(baseline))
  if (baseline) notes.push(`  · 单块指板渲染尺寸 ${baseline.w}×${baseline.h}`)

  const addBtn = sel<HTMLElement>('.board-add')
  ok('找到「添加指板」按钮', addBtn !== null)
  click(addBtn)
  const two = all('.board-card').length
  ok('点击一次后有 2 块指板', two === 2, `实际 ${two}`)
  notes.push(`  · 点击添加：${two} 块`)

  click(sel<HTMLElement>('.board-add'))
  const three = all('.board-card').length
  ok('点击两次后有 3 块指板', three === 3, `实际 ${three}`)
  notes.push(`  · 再点一次：${three} 块`)

  // ── 核心：加指板只往下延伸，不把已有的指板挤小 ──
  const sizes = [0, 1, 2].map(boardSize).filter((s): s is NonNullable<typeof s> => s !== null)
  ok('三块指板都量到了尺寸', sizes.length === 3)
  if (baseline && sizes.length === 3) {
    const sameW = sizes.every((s) => Math.abs(s.w - baseline.w) <= 1)
    const sameH = sizes.every((s) => Math.abs(s.h - baseline.h) <= 1)
    ok(
      '每块指板尺寸与只有一块时完全一致（没被挤小）',
      sameW && sameH,
      `基准 ${baseline.w}×${baseline.h}，实际 ${sizes.map((s) => `${s.w}×${s.h}`).join(' / ')}`,
    )
    notes.push(`  · 三块尺寸 ${sizes.map((s) => `${s.w}×${s.h}`).join(' / ')}（基准 ${baseline.w}×${baseline.h}）`)

    // 竖排：后一块必须在前一块下方，且水平范围重叠（同一列）
    const stacked = sizes[1].top >= sizes[0].bottom - 2 && sizes[2].top >= sizes[1].bottom - 2
    ok(
      '指板是竖向堆叠（后一块在前一块下方）',
      stacked,
      `top/bottom: ${sizes.map((s) => `${s.top}/${s.bottom}`).join(' , ')}`,
    )
    notes.push(`  · 纵向位置 ${sizes.map((s) => `${s.top}~${s.bottom}`).join(' , ')}`)

    // 指板宽度要接近卡片内容宽度（说明占满整行，而不是被分成多列）。
    // getBoundingClientRect 给的是边框盒，要自己扣掉左右内边距。
    const bodyEl = all('.board-card')[0].querySelector('.board-card-body')!
    const bodyCs = getComputedStyle(bodyEl)
    const innerW = Math.round(
      rectOf(bodyEl).width - parseFloat(bodyCs.paddingLeft) - parseFloat(bodyCs.paddingRight),
    )
    ok(
      '每块指板占满卡片内容宽度（没被分成多列）',
      Math.abs(sizes[0].w - innerW) <= 2,
      `指板 ${sizes[0].w}px vs 卡片内容宽 ${innerW}px`,
    )
    notes.push(`  · 指板宽 ${sizes[0].w}px，卡片内容宽 ${innerW}px`)
  }

  // 三块指板各自独立：读它们的调/调式选择框
  const selectsPerBoard = all('.board-card').map((c) => c.querySelectorAll('select').length)
  ok('每块指板都有自己的调/调式选择框', selectsPerBoard.every((n) => n >= 2), `实际 ${selectsPerBoard.join(',')}`)

  // 每块指板都要真的画出圆点
  const dotsPerBoard = all('.board-card').map((c) => c.querySelectorAll('.fb-note-body').length)
  ok('每块指板都渲染出了音符圆点', dotsPerBoard.every((n) => n > 0), `实际 ${dotsPerBoard.join(',')}`)
  notes.push(`  · 各指板圆点数 ${dotsPerBoard.join(' / ')}`)

  // 改第二块指板的调式，验证互不影响
  const secondCard = all('.board-card')[1]
  const secondSelects = [...secondCard.querySelectorAll('select')]
  const scaleSelect = secondSelects[1]
  const beforeText = secondCard.querySelector('.board-title')?.textContent ?? ''
  if (scaleSelect) {
    const opts = [...scaleSelect.querySelectorAll('option')]
    const target = opts.find((o) => o.value === 'harmonic-minor') ?? opts[opts.length - 1]
    if (target) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
      flushSync(() => {
        setter.call(scaleSelect, target.value)
        scaleSelect.dispatchEvent(new Event('change', { bubbles: true }))
      })
      const thirdText = all('.board-card')[2].querySelector('.board-title')?.textContent ?? ''
      const afterText = secondCard.querySelector('.board-title')?.textContent ?? ''
      ok('改第二块指板的调式后，标题变化', afterText !== beforeText, `${beforeText} → ${afterText}`)
      ok('第三块指板不受影响', thirdText !== afterText, `第二块 ${afterText} / 第三块 ${thirdText}`)
      notes.push(`  · 第二块改为 ${afterText}，第三块仍是 ${thirdText}`)
    }
  }

  // 删除一块
  const removeBtn = all<HTMLElement>('.board-icon-btn.is-danger').find((b) => !(b as HTMLButtonElement).disabled)
  if (removeBtn) {
    click(removeBtn)
    const afterRemove = all('.board-card').length
    ok('删除后指板数减一', afterRemove === 2, `实际 ${afterRemove}`)
    notes.push(`  · 删除一块后：${afterRemove} 块`)
  } else {
    ok('找到可用的删除按钮', false)
  }

  // ── ③ 对比度（两套主题各测一遍）──
  const current = document.documentElement.dataset.theme as 'dark' | 'light'
  for (const t of ['dark', 'light'] as const) {
    checkContrast(t)
  }
  setThemeInstant(current)

  // ── ④ 几何 ──
  checkGeometry()

  // ── ⑤ 右侧栏收起 / 展开 ──
  section('右侧栏收起与展开')

  // 上一次运行可能把「已收起」记进了 localStorage，先归位到展开态
  if (sel('.side-rail')) click(sel<HTMLElement>('.side-rail .side-toggle'))

  const sideColOpen = sel<HTMLElement>('.side-col')
  ok(
    '展开态：右侧栏存在且参与布局',
    sideColOpen !== null && getComputedStyle(sideColOpen).display !== 'none',
    sideColOpen ? `display=${getComputedStyle(sideColOpen).display}` : '找不到 .side-col',
  )
  ok('展开态：没有收起后的竖条', sel('.side-rail') === null)

  const openSize = boardSize(0)
  const collapseBtn = sel<HTMLElement>('.side-head .side-toggle')
  ok('找到「收起面板」按钮', collapseBtn !== null)
  click(collapseBtn)

  const sideColShut = sel<HTMLElement>('.side-col')
  ok(
    '收起后右侧栏不再参与布局（真收起，不是盖住）',
    sideColShut !== null && getComputedStyle(sideColShut).display === 'none',
    sideColShut ? `display=${getComputedStyle(sideColShut).display}` : '找不到 .side-col',
  )
  ok('收起后出现「展开面板」竖条', sel('.side-rail .side-toggle') !== null)

  const shutSize = boardSize(0)
  if (openSize && shutSize) {
    const gain = shutSize.w - openSize.w
    ok('收起后指板明显变宽', gain >= 300, `${openSize.w}px → ${shutSize.w}px（+${gain}px）`)
    ok('收起后指板等比变高', shutSize.h > openSize.h, `${openSize.h}px → ${shutSize.h}px`)
    notes.push(`  · 指板 ${openSize.w}×${openSize.h} → ${shutSize.w}×${shutSize.h}（宽 +${gain}px）`)
  } else {
    ok('能同时量到展开 / 收起两态的指板尺寸', false, JSON.stringify({ openSize, shutSize }))
  }

  // 竖条不能压在指板上
  const rail = sel<HTMLElement>('.side-rail')
  const firstCard = all('.board-card')[0]
  if (rail && firstCard) {
    const rr = rectOf(rail)
    const cr = rectOf(firstCard)
    ok(
      '展开按钮竖条在指板右侧，不重叠',
      rr.left >= cr.right - 1,
      `竖条 left=${rr.left.toFixed(1)} / 卡片 right=${cr.right.toFixed(1)}`,
    )
    notes.push(`  · 竖条 ${Math.round(rr.width)}px 宽，距指板右缘 ${Math.round(rr.left - cr.right)}px`)
  } else {
    ok('找到竖条与指板卡片以便做重叠判定', false)
  }

  // 点回去，且尺寸要逐像素还原
  click(sel<HTMLElement>('.side-rail .side-toggle'))
  ok('点击「展开面板」后右侧栏回来', sel('.side-col') !== null && sel('.side-rail') === null)
  const restored = boardSize(0)
  ok(
    '展开后指板尺寸逐像素还原',
    openSize !== null && restored !== null && Math.abs(restored.w - openSize.w) <= 1 && Math.abs(restored.h - openSize.h) <= 1,
    `${restored ? `${restored.w}×${restored.h}` : 'n/a'} vs ${openSize ? `${openSize.w}×${openSize.h}` : 'n/a'}`,
  )
  // ── ⑧ 调弦：固定 / 自由两种模式 ─────────────────────────
  // 这一段在真实 DOM 上走完「切模式 → 改弦数 → 改音高 → 来回切」，
  // SSR 渲染检查只能证明「渲染得出来」，这里证明「点了真的会动」。
  section('调弦面板（固定 / 自由）')

  const panelTitles = all('.panel-title').map((el) => (el.textContent ?? '').trim())
  ok('右侧栏出现「调弦」面板', panelTitles.includes('调弦'), `面板：${panelTitles.join(' / ')}`)
  ok(
    '调弦面板排在「全局显示选项」之前',
    panelTitles.indexOf('调弦') >= 0 && panelTitles.indexOf('调弦') < panelTitles.indexOf('全局显示选项'),
    `面板：${panelTitles.join(' / ')}`,
  )

  const fixedTab = findByText('.segmented-item', '固定调弦')
  const freeTab = findByText('.segmented-item', '自由调弦')
  ok('两种调弦模式都有按钮', fixedTab !== null && freeTab !== null)
  ok('默认停在固定调弦', fixedTab?.classList.contains('is-active') === true)
  ok('固定模式下没有逐弦选弦器', all('.string-pick').length === 0)

  const tuningGroups = all('#side-panels optgroup').map((g) => g.getAttribute('label') ?? '')
  ok(
    '调弦下拉按「六弦吉他 / 七弦吉他 / 贝斯」分组',
    ['六弦吉他', '七弦吉他', '贝斯'].every((g) => tuningGroups.includes(g)),
    `实际 ${tuningGroups.join(' / ')}`,
  )

  const tuningNames = all<HTMLOptionElement>('#side-panels select[aria-label="选择调弦"] option').map(
    (o) => (o.textContent ?? '').trim(),
  )
  ok('新增的五弦贝斯已入列', tuningNames.includes('贝斯五弦'), tuningNames.join(' / '))
  ok('新增的六弦 Drop C 已入列', tuningNames.includes('Drop C'))
  ok(
    '七弦吉他有两种调弦',
    tuningNames.includes('七弦标准 B') && tuningNames.includes('七弦 Drop A'),
    tuningNames.join(' / '),
  )

  // 先把固定调弦定成标准调弦 E，后面「自由模式拿固定调弦打底」才有确定基准。
  // 这一步同时也验证了固定调弦的下拉真的能改。
  const fixedSel = sel<HTMLSelectElement>('#side-panels select[aria-label="选择调弦"]')
  ok('找到固定调弦下拉', fixedSel !== null)
  setSelectValue(fixedSel, 'standard-e')

  // 切到自由调弦
  click(freeTab)
  ok('切换后「自由调弦」高亮', findByText('.segmented-item', '自由调弦')?.classList.contains('is-active') === true)
  ok('顶栏出现自由调弦指示器', findByText('.chip', '自由调弦') !== null)

  let picks = all<HTMLSelectElement>('.string-pick select')
  ok('自由模式渲染出 6 个选弦器（跟着当前固定调弦的弦数）', picks.length === 6, `实际 ${picks.length}`)
  ok(
    '选弦器按「1 弦在上」排列，且值就是标准调弦 EADGBE',
    picks.map((s) => s.value).join(',') === '64,59,55,50,45,40',
    `实际 ${picks.map((s) => s.value).join(',')}`,
  )
  ok(
    '第一行标签是 1 弦（最高音弦）',
    (all('.string-pick-label')[0]?.textContent ?? '').trim() === '1 弦',
    `实际 ${(all('.string-pick-label')[0]?.textContent ?? '').trim()}`,
  )

  // 弦数 6 → 7：应在最低音侧补一根低四度的弦（B1 = 35）
  const countSel = sel<HTMLSelectElement>('select[aria-label="自由调弦弦数"]')
  ok('找到弦数选择器', countSel !== null)
  setSelectValue(countSel, '7')
  picks = all<HTMLSelectElement>('.string-pick select')
  ok('弦数改为 7 后面板出现 7 个选弦器', picks.length === 7, `实际 ${picks.length}`)
  ok(
    '新增的是最低音弦 B1（低四度），不是高音弦',
    picks[picks.length - 1]?.value === '35',
    `实际 ${picks[picks.length - 1]?.value}`,
  )

  // 改一根弦的音高 → 面板脚注的音名列表必须跟着变
  setSelectValue(picks[picks.length - 1], '33')
  const footText = all('#side-panels .panel-foot').map((p) => p.textContent ?? '').join(' ')
  ok(
    '最低弦改成 A1 后脚注显示 A1 E2 A2 D3 G3 B3 E4',
    footText.includes('A1 E2 A2 D3 G3 B3 E4'),
    footText.slice(0, 140),
  )

  // 来回切模式：用户逐弦调好的结果不能被固定调弦冲掉
  click(findByText('.segmented-item', '固定调弦'))
  ok('切回固定后逐弦选弦器消失', all('.string-pick').length === 0)
  click(findByText('.segmented-item', '自由调弦'))
  const picksAgain = all<HTMLSelectElement>('.string-pick select')
  ok(
    '来回切换后逐弦设置被保留',
    picksAgain.length === 7 && picksAgain[6]?.value === '33',
    `实际 ${picksAgain.length} 根，最低弦 ${picksAgain[6]?.value}`,
  )
} catch (e) {
  failures.push(`测试脚本抛异常：${(e as Error).message}`)
}

// ── 报告 ─────────────────────────────────────────────────

const head = ['Fretboard 视觉与主题检验', ...notes, '', `检查项：${checks}`, `失败：${failures.length}`]
if (failures.length) {
  head.push('')
  for (const f of failures) head.push(`  ✗ ${f}`)
}
head.push('', failures.length === 0 ? 'RESULT: PASS' : 'RESULT: FAIL')

const out = document.getElementById('result')
if (out) out.textContent = head.join('\n')
document.title = failures.length ? 'FAIL' : 'PASS'
document.body.setAttribute('data-test', failures.length ? 'FAIL' : 'PASS')
