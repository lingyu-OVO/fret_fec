/**
 * smoke.mjs — 校验 dev server 真的能编译并返回每个模块
 * 用法：node scripts/smoke.mjs [baseUrl]
 */

const base = process.argv[2] ?? 'http://127.0.0.1:5180'

const paths = [
  '/',
  '/src/main.tsx',
  '/src/App.tsx',
  '/src/styles.css',
  '/src/audio/synth.ts',
  '/src/theory/notes.ts',
  '/src/theory/scales.ts',
  '/src/theory/chords.ts',
  '/src/theory/voicings.ts',
  '/src/theory/tunings.ts',
  '/src/components/Fretboard.tsx',
  '/src/components/MiniFretboard.tsx',
  '/src/components/Controls.tsx',
  '/src/components/ExplorePanel.tsx',
  '/src/components/ScalePanel.tsx',
  '/src/components/ChordPanel.tsx',
]

const ERROR_PATTERNS = [
  /Transform failed/i,
  /Internal server error/i,
  /Pre-transform error/i,
  /Failed to resolve import/i,
  /Failed to parse source/i,
  /Unexpected token/i,
  /The requested module .* does not provide/i,
]

let failures = 0

for (const p of paths) {
  try {
    const res = await fetch(base + p)
    const text = await res.text()
    const errPattern = ERROR_PATTERNS.find((re) => re.test(text))
    const short = text.length < 200 && !p.endsWith('.css')
    const ok = res.ok && !errPattern && !short

    const status = String(res.status).padEnd(4)
    const size = String(text.length).padStart(7)
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${status}${size}  ${p}`)

    if (!ok) {
      failures++
      console.log('      原因:', errPattern ? `匹配到 ${errPattern}` : short ? `响应过短（${text.length} 字节）` : `HTTP ${res.status}`)
      console.log('      片段:', JSON.stringify(text.slice(0, 400)))
    } else if (p === '/') {
      const hasRoot = text.includes('id="root"')
      const hasEntry = text.includes('/src/main.tsx')
      console.log(`      index.html: #root=${hasRoot} 入口脚本=${hasEntry}`)
      if (!hasRoot || !hasEntry) failures++
    }
  } catch (e) {
    failures++
    console.log(`FAIL ----       ${p}`)
    console.log('      异常:', e.message)
  }
}

// 单独验证 App.tsx 里关键符号确实被打包进去
try {
  const res = await fetch(base + '/src/App.tsx')
  const text = await res.text()
  const checks = [
    ['Fretboard 组件被引用', /Fretboard/],
    ['ScalePanel 被引用', /ScalePanel/],
    ['ChordPanel 被引用', /ChordPanel/],
    ['ExplorePanel 被引用', /ExplorePanel/],
    ['findVoicings 被引用', /findVoicings/],
    ['identifyChord 被引用', /identifyChord/],
    ['JSX 已转译（无裸 <div>）', /jsxDEV|jsx\(/],
  ]
  for (const [label, re] of checks) {
    const hit = re.test(text)
    if (!hit) failures++
    console.log(`${hit ? 'OK  ' : 'FAIL'}       App.tsx: ${label}`)
  }
} catch (e) {
  failures++
  console.log('FAIL       App.tsx 二次校验异常:', e.message)
}

console.log('')
console.log(failures === 0 ? `✅ dev server 正常，${paths.length} 个模块全部可编译` : `❌ ${failures} 项异常`)
// 用 exitCode 而不是 process.exit()：后者会在 fetch 句柄未关闭时触发 libuv 断言
process.exitCode = failures === 0 ? 0 : 1
