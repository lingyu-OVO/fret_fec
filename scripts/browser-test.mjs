/**
 * browser-test.mjs — 在真实浏览器里跑所有需要布局与命中的测试
 *
 * 覆盖两个页面：
 *   · tests/interaction.html  点击命中（点圆点本身能不能命中它那一格）
 *   · tests/visual.html       主题生效 / WCAG 对比度 / 几何重叠 / 多指板逻辑
 *
 * 两个页面内部都用 flushSync 同步完成，所以 chrome --dump-dom 在 load 事件时
 * 就能读到结果，不需要任何等待技巧。
 *
 * 注意：Chrome 是 GUI 子系统程序，Node 直接把文件句柄当 stdout 传给它时它拿不到，
 * 所以这里交给 cmd.exe 做 `>` 重定向，Node 侧 stdio:'ignore' 完全不碰管道。
 * （管道在受限沙箱里会被拒绝：spawn EPERM。）
 *
 * 用法：node scripts/browser-test.mjs [baseUrl] [chromePath]
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:5180'

const CHROME_CANDIDATES = [
  process.argv[3],
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('找不到 Chrome / Edge，可用第二个参数手动指定路径')
  process.exit(2)
}

const PAGES = [
  { name: '交互命中', file: 'tests/interaction.html' },
  { name: '视觉与主题', file: 'tests/visual.html' },
]

function runPage(file, outPath) {
  const url = `${base}/${file}`
  rmSync(outPath, { force: true })
  const cmd = [
    `"${chrome}"`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1500,1200',
    '--dump-dom',
    `"${url}"`,
    `> "${outPath}"`,
  ].join(' ')
  const res = spawnSync(cmd, { shell: true, stdio: 'ignore', windowsHide: true })
  if (res.error) return { error: res.error.message }
  if (!existsSync(outPath)) return { error: '浏览器没有产出 DOM 文件' }

  const dom = readFileSync(outPath, 'utf8')
  const verdict = /data-test="(PASS|FAIL)"/.exec(dom)?.[1]
  const block = /<pre id="result"[^>]*>([\s\S]*?)<\/pre>/.exec(dom)?.[1] ?? ''
  const text = block
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
  return { verdict, text, url }
}

console.log(`浏览器: ${chrome}`)
console.log(`地址:   ${base}\n`)

let failed = 0
for (const page of PAGES) {
  const outPath = resolve(`.tmp/browser-${page.file.split('/')[1].replace('.html', '')}.html`)
  mkdirSync(dirname(outPath), { recursive: true })
  console.log('═'.repeat(64))
  console.log(`▶ ${page.name}  (${page.file})`)
  console.log('═'.repeat(64))
  const r = runPage(page.file, outPath)
  if (r.error) {
    console.error(`  ✗ 运行失败: ${r.error}`)
    failed++
    continue
  }
  console.log(r.text || '(没读到结果块，页面可能没渲染出来)')
  if (r.verdict !== 'PASS') failed++
  console.log('')
}

if (failed > 0) {
  console.error(`✗ 有 ${failed} 个测试页面未通过`)
  process.exit(1)
}
console.log('✓ 全部浏览器测试通过')
