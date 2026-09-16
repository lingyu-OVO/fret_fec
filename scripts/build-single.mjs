// 把整个应用打包成一个自包含的 HTML 文件：双击即开，不需要 dev server、不需要联网。
//
//   npm run build:single      ->  Fretboard-Lab.html
//
// 原理：用 esbuild 把 src/main.tsx 打成一个 IIFE（传统 script，不是 ES module）
// 和一份 CSS，再把它们内联进 index.html 的壳里。
// 关键点：file:// 下 ES module 会被 CORS 拦掉，而内联的传统 <script> 不受影响，
// 所以这里必须是 iife + 内联，而不是 vite 默认的 module + 外链资源。
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tmpDir = path.join(root, '.tmp', 'single')
const outFile = path.join(root, 'Fretboard-Lab.html')

function resolveEsbuild() {
  const pkg = `@esbuild/${process.platform}-${process.arch}`
  const rel = process.platform === 'win32' ? 'esbuild.exe' : path.join('bin', 'esbuild')
  try {
    const require = createRequire(import.meta.url)
    return path.join(path.dirname(require.resolve(`${pkg}/package.json`)), rel)
  } catch {
    return path.join(root, 'node_modules', pkg, rel)
  }
}

const bin = resolveEsbuild()
if (!fs.existsSync(bin)) {
  console.error(`找不到 esbuild 可执行文件：${bin}\n请先运行 npm install。`)
  process.exit(1)
}

fs.rmSync(tmpDir, { recursive: true, force: true })
fs.mkdirSync(tmpDir, { recursive: true })

// stdio: 'inherit' 很重要：不能让 Node 用管道捕获子进程输出。
// 在受限沙箱里管道会命中 spawn EPERM，而 esbuild 自己是把结果写文件的，不需要捕获。
const run = spawnSync(
  bin,
  [
    path.join('src', 'main.tsx'),
    '--bundle',
    '--format=iife',
    '--jsx=automatic',
    '--target=es2020',
    '--minify',
    '--charset=utf8',
    '--legal-comments=none',
    '--define:process.env.NODE_ENV="production"',
    `--outfile=${path.join(tmpDir, 'app.js')}`,
  ],
  { cwd: root, stdio: 'inherit' },
)

if (run.error) throw run.error
if (run.status !== 0) process.exit(run.status ?? 1)

let js = fs.readFileSync(path.join(tmpDir, 'app.js'), 'utf8')
const cssFile = path.join(tmpDir, 'app.css')
let css = fs.existsSync(cssFile) ? fs.readFileSync(cssFile, 'utf8') : ''

// 内联进 HTML 前必须确保内容里没有能提前闭合标签的序列。
// '\/' 在 JS/CSS 字符串里与 '/' 等价，所以这样替换是安全的。
for (const [label, text] of [
  ['JS', js],
  ['CSS', css],
]) {
  for (const closer of ['</script', '</style', '<!--']) {
    if (text.toLowerCase().includes(closer)) {
      console.warn(`  ⚠ ${label} 里出现了 ${closer}，已做转义处理`)
    }
  }
}
js = js.replace(/<\/script/gi, () => '<\\/script')
css = css.replace(/<\/style/gi, () => '<\\/style')

const shellPath = path.join(root, 'index.html')
const shell = fs.readFileSync(shellPath, 'utf8')
const entryTag = '<script type="module" src="/src/main.tsx"></script>'
if (!shell.includes(entryTag)) {
  console.error(`index.html 里找不到入口标签，无法内联：\n  ${entryTag}`)
  process.exit(1)
}

const banner = '<!-- 本文件由 scripts/build-single.mjs 自动生成，请勿手改。改源码后重新运行：npm run build:single -->'

// 替换串一律用函数形式：字符串替换串里的 $& / $' / $` / $1 会被当成特殊模式解释。
// 内联的压缩 JS 里就含 "$&"（React 转义 CSS 选择器那段），用字符串替换串会把那段代码改坏。
const html = shell
  .replace(entryTag, () => `<style>\n${css}</style>\n<script>\n${js}</script>`)
  .replace('<head>', () => `<head>\n    ${banner}`)

// 自检：内联进去的 JS/CSS 必须逐字节原样存在，否则说明替换过程动了内容
// （比如字符串替换串里的 $& 被解释成了"匹配内容"）。
if (!html.includes(js) || (css && !html.includes(css))) {
  console.error('内联后 JS/CSS 内容与打包结果不一致，产物已作废。')
  process.exit(1)
}
if (html.includes(entryTag)) {
  console.error(`产物里仍残留入口标签，说明替换没生效：${entryTag}`)
  process.exit(1)
}

fs.writeFileSync(outFile, html, 'utf8')

const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0)
console.log(`\n✅ 生成 ${path.relative(root, outFile)}（${kb} KB，自包含单文件）`)
console.log('   双击它就能练琴：不需要 dev server，不需要联网。')
