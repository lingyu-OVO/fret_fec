/**
 * render-check.tsx — 把整个 React 组件树真的渲染一遍（SSR），确认没有运行时错误
 *
 * 它比 tsc 更进一步：useMemo 里的 findVoicings / identifyChord / buildScale 都会被真正执行，
 * 能抓出「类型没问题但一渲染就炸」的问题。
 */

import { renderToStaticMarkup } from 'react-dom/server'
import App from '../src/App'
import { Fretboard, type FretMark } from '../src/components/Fretboard'
import { MiniFretboard } from '../src/components/MiniFretboard'
import { ExplorePanel } from '../src/components/ExplorePanel'
import { ScalePanel } from '../src/components/ScalePanel'
import { ChordPanel } from '../src/components/ChordPanel'
import { TUNING_BY_ID } from '../src/theory/tunings'
import { findVoicings } from '../src/theory/voicings'
import { CHORD_BY_ID } from '../src/theory/chords'

let pass = 0
let fail = 0
const problems: string[] = []

function must(label: string, html: string, needles: string[]) {
  for (const n of needles) {
    if (html.includes(n)) pass++
    else {
      fail++
      problems.push(`  ✗ ${label}：缺少 "${n}"`)
    }
  }
}

function countOf(html: string, needle: string): number {
  return html.split(needle).length - 1
}

function mustTrue(label: string, cond: boolean, detail = '') {
  if (cond) pass++
  else {
    fail++
    problems.push(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

const noop = () => {}
const std = TUNING_BY_ID['standard-e']

// ── 1. 整个 App（默认进入探索模式）───────────────────────
let appHtml = ''
try {
  appHtml = renderToStaticMarkup(<App />)
  console.log(`【1】App 整体渲染成功，输出 ${appHtml.length} 字节 HTML`)
  must('App', appHtml, [
    'Fretboard Lab',
    '电吉他指板学习台',
    '指板探索',
    '音阶',
    '和弦',
    'class="fretboard"',
    '标准调弦 E',
  ])
  mustTrue('App：指板热区已生成', countOf(appHtml, 'fb-hit') > 60, `fb-hit 出现 ${countOf(appHtml, 'fb-hit')} 次`)
  mustTrue('App：音名点已生成', countOf(appHtml, 'fb-note ') > 60, `fb-note 出现 ${countOf(appHtml, 'fb-note ')} 次`)
  mustTrue('App：左侧弦号已渲染', appHtml.includes('fb-stringnum'))
  mustTrue('App：左侧弦名已渲染', appHtml.includes('fb-stringname'))
  mustTrue('App：品位数字已渲染', appHtml.includes('fb-fretnum'))
  mustTrue('App：多指板卡片已渲染', appHtml.includes('board-card'))
  mustTrue('App：添加指板瓦片已渲染', appHtml.includes('board-add'))
  mustTrue('App：指板网格已渲染', appHtml.includes('board-grid'))
  mustTrue('App：主题切换按钮已渲染', appHtml.includes('黑夜') || appHtml.includes('白天'))
  // 圆点主标签（音级）与副标签（音名）必须同时存在
  mustTrue('App：指板圆点带标签', appHtml.includes('fb-note-label'))
} catch (e) {
  fail++
  problems.push(`  ✗ App 渲染抛异常：${(e as Error).message}\n${(e as Error).stack?.split('\n').slice(0, 6).join('\n')}`)
}

// ── 2. 音阶模式面板 ──────────────────────────────────────
try {
  const html = renderToStaticMarkup(
    <ScalePanel
      keyPc={9}
      keyLetterIdx={5}
      scaleId="minor-blues"
      showDegrees
      onlyRoots={false}
      showOutside={false}
      positionWindowId="all"
      onChangeKey={noop}
      onChangeScale={noop}
      onToggleDegrees={noop}
      onToggleRoots={noop}
      onToggleOutside={noop}
      onChangeWindow={noop}
      onPlayScale={noop}
    />,
  )
  console.log(`【2】ScalePanel 渲染成功`)
  // A 小调布鲁斯：A C D Eb E G —— b5 必须写成 Eb
  must('ScalePanel', html, ['A', 'C', 'D', 'Eb', 'E', 'G', '小调布鲁斯', '音级'])
  mustTrue('ScalePanel：b5 拼成 Eb 而不是 D#', html.includes('Eb') && !html.includes('D#<'))
  mustTrue('ScalePanel：8 个音级芯片', countOf(html, 'tone-chip') >= 6)
} catch (e) {
  fail++
  problems.push(`  ✗ ScalePanel 渲染抛异常：${(e as Error).message}`)
}

// ── 3. 探索模式面板 ──────────────────────────────────────
try {
  const html = renderToStaticMarkup(
    <ExplorePanel
      tuning={std}
      selection={[
        { stringIdx: 1, fret: 3 },
        { stringIdx: 5, fret: 3 },
      ]}
      showAllNotes
      naturalsOnly={false}
      preferFlat={false}
      refKeyPc={0}
      onChangeRefKey={noop}
      onToggleAll={noop}
      onToggleNaturals={noop}
      onClear={noop}
      onPlay={noop}
    />,
  )
  console.log(`【3】ExplorePanel 渲染成功`)
  // 5 弦 3 品 = C4，1 弦 3 品 = G4
  must('ExplorePanel', html, ['C', 'G', '4 品'.replace('4', '3'), 'note-degree'])
  mustTrue('ExplorePanel：两行已选音', countOf(html, 'note-row') === 2)
} catch (e) {
  fail++
  problems.push(`  ✗ ExplorePanel 渲染抛异常：${(e as Error).message}`)
}

// ── 4. 和弦面板：识别 + 查按法 ────────────────────────────
try {
  const voicings = findVoicings(CHORD_BY_ID.maj, 0, std, { limit: 24 })
  const html = renderToStaticMarkup(
    <ChordPanel
      tuning={std}
      preferFlat={false}
      sub="identify"
      onChangeSub={noop}
      selected={[
        { stringIdx: 1, fret: 3 },
        { stringIdx: 2, fret: 2 },
        { stringIdx: 3, fret: 0 },
        { stringIdx: 4, fret: 1 },
        { stringIdx: 5, fret: 0 },
      ]}
      onClearSelection={noop}
      onRemoveNote={noop}
      onPlayNote={noop}
      onJumpToLibrary={noop}
      libraryRootPc={0}
      libraryRootLetterIdx={0}
      libraryChordId="maj"
      onChangeLibraryRoot={noop}
      onChangeLibraryChord={noop}
      voicings={voicings}
      voicingIndex={0}
      onSelectVoicing={noop}
      onPlayVoicing={noop}
      opts={{ requireRootInBass: true, allowOpen: true, maxSpan: 4, minSounding: 4 }}
      onChangeOpts={noop}
      showToneMap
      onToggleToneMap={noop}
      parseInput=""
      onChangeParseInput={noop}
    />,
  )
  console.log(`【4】ChordPanel(识别) 渲染成功`)
  must('ChordPanel识别', html, ['chord-hero-symbol', '大三和弦', 'cand-list', '查按法'])
  mustTrue('ChordPanel：识别结果为 C', html.includes('>C</span>') || html.includes('>C<'))
} catch (e) {
  fail++
  problems.push(`  ✗ ChordPanel(识别) 渲染抛异常：${(e as Error).message}`)
}

try {
  const voicings = findVoicings(CHORD_BY_ID.maj, 0, std, { limit: 48 })
  const html = renderToStaticMarkup(
    <ChordPanel
      tuning={std}
      preferFlat={false}
      sub="library"
      onChangeSub={noop}
      selected={[]}
      onClearSelection={noop}
      onRemoveNote={noop}
      onPlayNote={noop}
      onJumpToLibrary={noop}
      libraryRootPc={0}
      libraryRootLetterIdx={0}
      libraryChordId="maj"
      onChangeLibraryRoot={noop}
      onChangeLibraryChord={noop}
      voicings={voicings}
      voicingIndex={0}
      onSelectVoicing={noop}
      onPlayVoicing={noop}
      opts={{ requireRootInBass: true, allowOpen: true, maxSpan: 4, minSounding: 4 }}
      onChangeOpts={noop}
      showToneMap
      onToggleToneMap={noop}
      parseInput=""
      onChangeParseInput={noop}
    />,
  )
  console.log(`【5】ChordPanel(查按法) 渲染成功，${voicings.length} 个指型`)
  must('ChordPanel查按法', html, ['voicing-grid', 'voicing-card', 'mini-fretboard', '当前指型'])
  mustTrue(
    'ChordPanel：C 大三和弦包含 x32010',
    voicings.some((v) => v.frets.map((f) => (f === null ? 'x' : f)).join('') === 'x32010'),
    `实际: ${voicings.map((v) => v.frets.map((f) => (f === null ? 'x' : f)).join('')).slice(0, 12).join(' ')}`,
  )
  mustTrue('ChordPanel：指型卡片已渲染', countOf(html, 'voicing-card') >= 20, `渲染了 ${countOf(html, 'voicing-card')} 个`)
} catch (e) {
  fail++
  problems.push(`  ✗ ChordPanel(查按法) 渲染抛异常：${(e as Error).message}`)
}

// ── 5. 指板 + 小指型图 ───────────────────────────────────
try {
  const marks: FretMark[] = [
    { stringIdx: 0, fret: 3, label: 'G', variant: 'root' },
    { stringIdx: 1, fret: 5, label: 'D', sub: '5', variant: 'tone' },
    { stringIdx: 5, fret: 0, label: 'E', variant: 'selected' },
  ]
  const html = renderToStaticMarkup(
    <Fretboard tuning={std} startFret={0} fretCount={12} marks={marks} interactive onCellClick={noop} />,
  )
  console.log(`【6】Fretboard 渲染成功`)
  must('Fretboard', html, ['fb-root', 'fb-tone', 'fb-selected', 'fb-nut', 'fb-fretnum-strong'])
  mustTrue('Fretboard：原点弦名 E A D G B E 全在', ['>E<', '>A<', '>D<', '>G<', '>B<'].every((s) => html.includes(s)))

  const mini = renderToStaticMarkup(<MiniFretboard tuning={std} frets={[null, 3, 2, 0, 1, 0]} degrees={[null, '1', '3', '1', '3', '1']} />)
  must('MiniFretboard', mini, ['mini-fretboard', 'mini-deg', 'is-root'])
  console.log(`【7】MiniFretboard 渲染成功`)

  // ── 圆点里「音级 + 音名」两行都要清晰可读 ──
  const twoLine = renderToStaticMarkup(
    <Fretboard
      tuning={std}
      startFret={0}
      fretCount={3}
      marks={[{ stringIdx: 1, fret: 3, label: 'b3', sub: 'Eb', variant: 'tone' }]}
    />,
  )
  const labelMatch = /<text x="([\d.]+)" y="([\d.]+)" class="fb-note-label"[^>]*>b3<\/text>/.exec(twoLine)
  const subMatch = /<text x="([\d.]+)" y="([\d.]+)" class="fb-note-sub"[^>]*>Eb<\/text>/.exec(twoLine)
  mustTrue(
    'Fretboard：音级 b3 与音名 Eb 同时渲染成两个文本节点',
    Boolean(labelMatch && subMatch),
    `label=${Boolean(labelMatch)} sub=${Boolean(subMatch)}`,
  )
  if (labelMatch && subMatch) {
    const sameX = Math.abs(Number(labelMatch[1]) - Number(subMatch[1])) < 0.01
    const lineGap = Number(subMatch[2]) - Number(labelMatch[2])
    mustTrue('Fretboard：音级在上、音名在下，垂直间距 ≥ 14px', sameX && lineGap >= 14, `dy=${lineGap}`)
  }
  // 主层圆点要比底图层大，形成视觉层次
  const bigDot = /class="fb-note fb-tone[^"]*"[\s\S]*?<circle[^>]*r="([\d.]+)"/.exec(twoLine)
  const baseDot = /class="fb-note fb-muted[^"]*"[\s\S]*?<circle[^>]*r="([\d.]+)"/.exec(
    renderToStaticMarkup(
      <Fretboard tuning={std} startFret={0} fretCount={2} marks={[{ stringIdx: 0, fret: 1, label: 'C', variant: 'muted' }]} />,
    ),
  )
  mustTrue(
    'Fretboard：主层圆点半径大于底图层',
    Number(bigDot?.[1] ?? 0) > Number(baseDot?.[1] ?? 0),
    `主层 r=${bigDot?.[1]} 底层 r=${baseDot?.[1]}`,
  )

  // 起始品不为 0（无琴枕）
  const noNut = renderToStaticMarkup(<Fretboard tuning={std} startFret={5} fretCount={10} marks={[]} />)
  mustTrue(
    'Fretboard：startFret=5 时不画琴枕线',
    !noNut.includes('stroke="url(#fb-nut)"'),
    '琴枕线仍被渲染',
  )
  // 品位数字要限定在 fb-fretnum 这个 class 里找，否则会和弦号（1..6）撞
  const fretNums = [...noNut.matchAll(/fb-fretnum[^"]*"[^>]*>(\d+)</g)].map((m) => Number(m[1]))
  mustTrue(
    'Fretboard：startFret=5 时品位数字是 5..14',
    fretNums.length === 10 && fretNums[0] === 5 && fretNums[9] === 14,
    `实际: ${fretNums.join(',')}`,
  )
} catch (e) {
  fail++
  problems.push(`  ✗ Fretboard/Mini 渲染抛异常：${(e as Error).message}`)
}

// ── 6. 所有调弦 × 所有模式都不炸 ──────────────────────────
try {
  let n = 0
  for (const t of Object.values(TUNING_BY_ID)) {
    const m: FretMark[] = [{ stringIdx: 0, fret: 2, label: 'X', variant: 'tone' }]
    renderToStaticMarkup(<Fretboard tuning={t} startFret={0} fretCount={12} marks={m} interactive onCellClick={noop} />)
    n++
  }
  console.log(`【8】全部 ${n} 种调弦渲染成功（含 7 弦与 4 弦贝斯）`)
  pass++
} catch (e) {
  fail++
  problems.push(`  ✗ 多调弦渲染抛异常：${(e as Error).message}`)
}

// ── 6. 点击热区必须与圆点同心 ────────────────────────────
// 这个用例是回归防线：圆点画在热区之上，一旦圆点开始吃鼠标事件，
// 用户就只能点到圆点以外的边缘区域（「点不中音」）。
try {
  /** 从 SSR 输出里按文档顺序抽取某类元素的属性 */
  function extract(html: string, tag: string, cls: string): Record<string, string>[] {
    const re = new RegExp(`<${tag}\\b[^>]*class="${cls}"[^>]*/?>`, 'g')
    const out: Record<string, string>[] = []
    for (const m of html.matchAll(re)) {
      const attrs: Record<string, string> = {}
      for (const a of m[0].matchAll(/([A-Za-z-]+)="([^"]*)"/g)) attrs[a[1]] = a[2]
      out.push(attrs)
    }
    return out
  }

  for (const startFret of [0, 5]) {
    const fretCount = 3
    const first = startFret === 0 ? 1 : startFret
    const fretsShown = startFret === 0 ? [0, 1, 2, 3] : [first, first + 1, first + 2]

    // 标记按「f 外层、s 内层」的顺序传入，和热区的渲染顺序一致
    const mk: FretMark[] = []
    for (const f of fretsShown) {
      for (let s = 0; s < std.strings.length; s++) {
        mk.push({ stringIdx: s, fret: f, label: 'X', variant: 'tone' })
      }
    }

    const html = renderToStaticMarkup(
      <Fretboard tuning={std} startFret={startFret} fretCount={fretCount} marks={mk} interactive onCellClick={noop} />,
    )

    const rects = extract(html, 'rect', 'fb-hit')
    const dots = extract(html, 'circle', 'fb-note-body')

    mustTrue(
      `热区用例(startFret=${startFret})：热区数 = 圆点数 = ${mk.length}`,
      rects.length === mk.length && dots.length === mk.length,
      `热区 ${rects.length} 个 / 圆点 ${dots.length} 个 / 期望 ${mk.length} 个`,
    )

    let maxDx = 0
    let maxDy = 0
    let mismatch = ''
    for (let i = 0; i < Math.min(rects.length, dots.length); i++) {
      const rc = rects[i]
      const dc = dots[i]
      const rectCx = Number(rc.x) + Number(rc.width) / 2
      const rectCy = Number(rc.y) + Number(rc.height) / 2
      const dx = Math.abs(rectCx - Number(dc.cx))
      const dy = Math.abs(rectCy - Number(dc.cy))
      if (dx > maxDx) maxDx = dx
      if (dy > maxDy) maxDy = dy
      if ((dx > 0.01 || dy > 0.01) && !mismatch) {
        mismatch = `第 ${i} 个(${mk[i].stringIdx}弦${mk[i].fret}品) 热区中心(${rectCx},${rectCy}) vs 圆点中心(${dc.cx},${dc.cy})`
      }
    }

    mustTrue(
      `热区用例(startFret=${startFret})：每个热区与圆点严格同心`,
      maxDx < 0.01 && maxDy < 0.01,
      `最大偏差 dx=${maxDx} dy=${maxDy}${mismatch ? `\n      ${mismatch}` : ''}`,
    )
  }
  console.log(`【9】点击热区与圆点同心性检查完成`)
} catch (e) {
  fail++
  problems.push(`  ✗ 热区同心性检查抛异常：${(e as Error).message}`)
}

console.log('\n' + '═'.repeat(62))
if (fail === 0) console.log(`✅ 渲染检查全部通过：${pass} 项`)
else {
  console.log(`❌ ${fail} 项失败 / 共 ${pass + fail} 项\n`)
  console.log(problems.join('\n'))
}
console.log('═'.repeat(62) + '\n')

process.exit(fail === 0 ? 0 : 1)
