# Fretboard Lab · 电吉他指板学习台

一个把「指板记忆」变成可交互练习的 Web 工具。核心功能：

| 功能 | 说明 |
| --- | --- |
| **指板探索** | 空白指板上点击任意一品显示音名，可一键铺满整块指板的所有音名 |
| **音阶模式** | 任选调 × 调式，指板点亮全部音阶音，圆点里同时显示音级和音名 |
| **和弦模式** | ① 在指板上点出音符 → 识别和弦名（带评分与歧义候选）② 给出和弦名 → 列出所有可弹指型 |
| **多指板对比** | 每个模式都能「＋添加指板」，**竖向往下依次排列**，每块保持和单块时完全一样的尺寸（不被挤小）；各自独立配置，可折叠、复制、删除 |
| **调弦（固定 / 自由）** | 右侧面板切换两种模式。**固定调弦** 11 种，按下拉分组：六弦吉他（标准 E / Drop D / Drop C / 降半音 Eb / 降全音 D / DADGAD / Open G）、七弦吉他（标准 B / Drop A）、贝斯（四弦 EADG / 五弦 BEADG）。**自由调弦** 逐弦指定音高，弦数 4~7 可调，加弦时自动在最低音侧补一根低四度的弦（六弦补出七弦的低音 B、四弦贝斯补出五弦的低音 B）。两种模式都写进分享链接 |
| **侧栏收起** | 一键收起右侧面板，让出的整列宽度**直接变成指板的放大**（指板是 `viewBox` 等比缩放，不需要任何 JS 尺寸计算）；收起后留一条 54px 竖条随时展开，状态记在本地 |
| **白天 / 黑夜** | 一键切换，首次访问跟随系统深浅色偏好；设置持久化，链接可分享 |
| **弦号 / 弦名** | 指板左侧独立弦栏显示 6~1 弦号与 EADGBE 空弦音名，与音符圆点区域完全分离 |

**当前状态：可运行的前端原型（MVP 已完整可玩），后端尚未接入。**

---

## 快速开始

```bash
npm install
npm run dev          # http://127.0.0.1:5180
```

> 首次 `npm install` 会为 esbuild 跑一次 postinstall 脚本。若在受限的安全沙箱里运行，
> 可能因「子进程管道被拦截」而报 `spawn EPERM`，换到普通终端执行即可。

其他命令：

```bash
npm run typecheck     # TypeScript 全量类型检查
npm run verify        # 乐理引擎自检（70 项断言：音名拼写 / 和弦识别 / 指型生成）
npm run render-check  # SSR 渲染整棵组件树（62 项断言，含热区同心性、双行标签间距）
npm run smoke         # 检查 dev server 是否真的能编译并返回每个模块
npm run browser-test  # 真实浏览器检验（需先起着 dev server，见下）
npm run check         # typecheck + verify + render-check
npm run build         # 产出纯静态 dist/
npm run build:single  # 产出 Fretboard-Lab.html（自包含单文件，双击即用）
```

### 日常练琴：两种打开方式

#### ① 双击 `Fretboard-Lab.html`（推荐，零依赖）

```bash
npm run build:single   # 生成 Fretboard-Lab.html（约 226 KB 自包含单文件）
```

生成后**双击它就直接进网站**：不需要 dev server、不需要联网、不占端口。
可以复制到桌面 / U 盘 / 直接发给别人。改过源码后重新跑一次这条命令即可。

> **从 GitHub clone 下来的人注意**：`Fretboard-Lab.html` 是构建产物，按设计不进版本库
> （见 `.gitignore`），所以 clone 之后没有这个文件，必须先 `npm install && npm run build:single`
> 才能拿到单文件版。想要在线玩的链接见「部署到线上」一章。

已验证（真实 Chrome，`file://` 协议）：
`localStorage=ok`、React 成功挂载、`elementFromPoint` 命中 `.fb-hit` 热区、
连续两次点击让音符数 90 → 91 → 92 且面板同步显示「已标记 2 个音」。

> **为什么根目录的 `index.html` 双击没用？** 它只是 Vite 的入口壳，真正的代码是
> `/src/main.tsx` 这个 ES module。`file://` 下浏览器会以 CORS 为由拒绝加载 module
> （origin 是 `null`），也解析不了 `/src/...` 这种根绝对路径 —— 双击只会得到空白页。
> 单文件版是把 JS/CSS 全部内联成**传统 `<script>`**（esbuild `--format=iife`）才绕开这条限制，
> 所以根目录的 `index.html` 必须保持原样，否则 `npm run dev` 会坏掉。
>
> 内联时的坑：替换串一定要用函数形式 `.replace(tag, () => html)`。字符串替换串里的
> `$&` / `` $` `` / `$'` 会被当成特殊模式解释，而压缩后的 React 里就含 `$&`
> （转义 CSS 选择器那段），用字符串形式会把 React 内部代码改坏。脚本里已加自检断言。

#### ② 双击 `练琴.cmd`（改代码时用，有热更新）

1. 先探测 5180 端口 —— 已经在跑就直接打开浏览器（不会重复启动、也不会撞 `strictPort` 报错）
2. 没在跑就启动 dev server，并在服务就绪后自动打开 <http://127.0.0.1:5180>

练琴期间保留那个黑窗口（可最小化），关掉窗口就停止服务。

> 为什么用 `.cmd` 而不是 PowerShell 脚本：Windows 默认执行策略会拦下 `npm.ps1`，
> 在 PowerShell 里直接敲 `npm run dev` 可能报「此系统上禁止运行脚本」。
> 用 `cmd`/双击 `.cmd` 走的是 `npm.cmd`，不受该策略影响；一定要在 PowerShell 里跑就写 `npm.cmd run dev`。

想放桌面：右键对应的文件 → 显示更多选项 → 发送到 → 桌面快捷方式。

### 调弦：固定与自由两种模式

调弦控件在**右侧面板**（不是顶栏）。顶栏只留一个指示器显示当前调弦名，点它会展开右侧面板 ——
因为面板收起时 `.side-col` 是 `display: none`，没有这个指示器就完全看不出当前用的什么调弦。

**固定调弦**｜从内置表里选，下拉框按乐器分三组：

| 分组 | 调弦 |
| --- | --- |
| 六弦吉他 | 标准调弦 E、Drop D、**Drop C**、降半音 Eb、降全音 D、DADGAD、Open G |
| 七弦吉他 | 七弦标准 B、**七弦 Drop A** |
| 贝斯 | 贝斯四弦 EADG、**贝斯五弦 BEADG** |

**自由调弦**｜逐弦指定音高，弦数 4~7 可调。几个设计上的取舍：

- **行序是「1 弦在上」**，和指板的视觉方向一致，不是按数组下标顺序排。
- **加弦时在最低音侧补一根低四度的弦**，这不是随手定的：六弦 EADGBE 补出 `B1`，
  正好是七弦吉他的低音 B 弦；四弦贝斯补出 `B0`，正好是五弦贝斯的低音 B 弦。
  减弦则对称地从低音侧砍（七弦 BEADGBE 减到六弦退回 EADGBE，而不是砍掉高音 E）。
- **首次进自由模式会用当前固定调弦打底**，避免突然冒出一块和刚才毫无关系的指板；
  但只要用户动手调过，来回切模式就再也不会覆盖 —— 否则切一次就把调好的结果冲掉了。
- 面板提供一个「复制固定调弦」按钮，可以把当前固定调弦的音高拷进自由模式，弦数保持不变。

**分享链接**里带 `tmode=fixed|free`，自由模式额外带 `strings=36,43,48,53,57,62`（MIDI，低音弦→高音弦）。
固定模式下不写 `strings`，免得链接被无用的弦高信息撑长。脏链接有兜底：弦数不足 4 根整条丢弃、
越界音高钳进 `E0~E5`、超过 7 根截断。

### 关于 `npm run browser-test`

它跑两个无头浏览器页面，覆盖**只有真实布局才能验的东西**：

| 页面 | 验什么 |
| --- | --- |
| `tests/interaction.html` | **点击命中**：用 `document.elementFromPoint`（与真实点击同一套命中逻辑）逐个圆点探测 5 个位置，共 412 个探测点 |
| `tests/visual.html` | **主题生效**（读计算样式算亮度）、**WCAG 对比度**（含 alpha 合成后的真实底色）、**几何无重叠/无裁切**、**多指板逻辑**（真实点击「添加指板」并断言卡片数、各指板配置互不影响） |

> 受限沙箱环境下 Chrome 起不来（它的多进程 IPC 依赖命名管道），`browser-test` 需要在普通终端里跑。

### 项目结构

```
src/
├── theory/              ★ 乐理引擎（纯函数，零依赖，可在 Node / 后端复用）
│   ├── notes.ts           音高表示、音名拼写、MIDI/频率换算
│   ├── scales.ts          19 种音阶定义 + 生成
│   ├── chords.ts          35 种和弦公式 + 识别算法 + 和弦名解析
│   ├── voicings.ts        指型搜索（DFS + 四层剪枝）
│   └── tunings.ts         8 种调弦 + 指板几何
├── audio/synth.ts       Karplus-Strong 拨弦合成（无采样资源）
├── components/
│   ├── BoardCard.tsx      指板卡片（标题 + 卡片内联控制 + 复制/删除）
│   ├── Fretboard.tsx      主指板（SVG，横向，低音弦在下）
│   ├── MiniFretboard.tsx  小指型图（SVG，纵向，低音弦在左）
│   ├── ExplorePanel.tsx   探索模式面板
│   ├── ScalePanel.tsx     音阶模式面板
│   ├── ChordPanel.tsx     和弦模式面板（识别 / 查按法）
│   └── Controls.tsx       通用控件
├── state/url.ts        应用状态 ↔ URL query 双向编解码（链接即存档，含多指板与主题）
├── App.tsx             编排层：模式切换 / 多指板增删 / 主题 / 指板标记计算 / 播放
└── styles.css          原生 CSS + CSS 变量（暗色与白天两套主题）

scripts/
├── verify-theory.ts    乐理引擎自检用例
├── render-check.tsx    整棵组件树 SSR 渲染自检
├── browser-test.mjs    无头浏览器跑 tests/ 下的两个页面
└── smoke.mjs           dev server 冒烟检查

tests/
├── interaction.html / .tsx   点击命中测试（elementFromPoint）
└── visual.html / .tsx        主题 / 对比度 / 几何 / 多指板测试

docs/ARCHITECTURE.md    ★ 完整方案设计与架构（含后端/数据库选型论证）
```

---

## 三个技术要点

### 1. 音名拼写：按「音级字母 + 变音记号」推导，而不是查 12 音名表

查表法会把 F 大调的第 4 级写成 `A#`，正确写法是 `Bb`；会把 C 布鲁斯的 b5 写成 `F#`，正确写法是 `Gb`。

```
音级标签 'b5' → 音级号 5 → 字母步进 4 → 字母 G（自然音高 7）
              → 目标音高 6 → 差 -1 → 一个降号 → 'Gb'   ✅
```

`scales.ts` 里音阶只声明 `{ intervals, degrees }`，字母步进由 degree 里的数字推导，所以 12 个调 × 19 种音阶的拼写全部自动正确。

### 2. 和弦识别：特征音 + 评分排序，不做精确匹配

真实演奏会省音、加音（`Cmaj7` 常常弹成 `x32000`，省掉五音）。识别算法：

1. 遍历每个候选根音，算出相对音程位掩码
2. **特征音（essential）缺一即否决** —— 特征音定义了「这个和弦之所以是它」
3. 评分：缺可选音扣分、多余音重罚、**低音证据**加分 / 扣分、完美匹配加分
4. 过滤掉与第一名差距过大的硬凑读法，保留真实歧义

**低音是消歧的关键**：`{C, E, G, A}` 这堆音里 `C6` 和 `Am7` 都"完美匹配"，只有低音能决定读法 —— 低音 C 读 `C6`，低音 A 读 `Am7`，低音 G 读 `Am7/G`。

### 3. 指型生成：DFS + 四层剪枝

朴素枚举是 `25^6 ≈ 2.4 亿`，必须剪枝：

1. **音高剪枝**：只允许按在和弦音上的品
2. **锚点剪枝**：枚举最低按弦品位，每根弦只允许 `anchor..anchor+maxSpan`（手只有 4–5 品跨度）
3. **跨度剪枝**：DFS 中实时维护跨度，超标立刻回溯
4. **可行性剪枝**：剩余弦数不够补齐特征音 / 凑不满最少发声弦数 / 低音要求不满足 → 回溯

实测 C 大三和弦全枚举 < 100ms，结果里能同时找到 `x32010`（开放）和 `x35553`（大横按）。

### 4. SVG 交互陷阱：画在上层的标记会吃掉点击

指板上的音符圆点画在点击热区 `<rect class="fb-hit">` **之后**，所以圆点在上层。SVG 里被填充的图形默认会捕获指针事件 —— 结果就是点击停在**没有 `onClick` 的圆点上**，传不到下面的热区，表现为「点不中音，只能点圆点旁边的缝隙」。

修法是给整个标记层加 `pointer-events: none`（`.fb-note`），让事件穿透到热区；同时把 SVG 原生 `<title>` tooltip 换成状态栏的悬停读数，反馈更快也更清楚。

**这个坑类型检查和 SSR 都抓不到** —— 因为热区和圆点的几何是完全同心的，两边坐标一模一样。所以有了 `tests/interaction.html`：在真实浏览器里用 `document.elementFromPoint` 逐个圆点探测 5 个位置，共 412 个探测点。撤掉修复后它会 412/412 全红，这道防线是有效的。

### 5. 看不到截图时，怎么验「看着对不对」

把主观的「看着对不对」翻译成可计算的量，在真实浏览器里量：

| 关心的事 | 换算成 |
| --- | --- |
| 主题切换是否真的生效 | `getComputedStyle` 读背景色 → 相对亮度（暗色 < 0.12，白天 > 0.6） |
| 文字能不能看清 | WCAG 对比度，且背景要先把 `rgba()` 逐层 alpha 合成出真实底色 |
| 加指板会不会把指板挤小 | 量每块 `svg.fretboard` 的实际渲染尺寸，必须与单块时**逐像素一致** |
| 收起侧栏有没有真的把指板放大 | 量收起前后 `svg.fretboard` 的渲染尺寸：宽度增幅必须 ≥ 300px 且高度同步变高，展开后必须**逐像素还原**；同时断言侧栏 `display:none`（真收起，不是被盖住）、竖条不与指板卡片相交 |
| 指板是不是竖着往下排 | 比较相邻卡片的 `top/bottom`，后一块必须在前一块下方 |
| 弦栏会不会压住圆点 | `getBoundingClientRect` 两两求交 |
| 圆点里两行字会不会溢出/重叠 | 文字四角到圆心的距离 ≤ 半径；上下行盒不相交 |
| 多指板逻辑对不对 | 真实派发 `click`，断言卡片数、各指板配置互不影响 |

这套检查抓出过 6 个真实问题：
- 暗色辅助文字只有 2.82:1、品位数字 2.54:1、浅色下白字压橙底只有 3.19:1
- **圆点里上下两行在指板变宽后会贴上**（原设计只留了 1px 逻辑间隙，小尺寸下侥幸没触发）

修完后：暗色最低 3.55:1、白天最低 3.46:1；三块指板尺寸 983×296 / 983×296 / 983×296，与单块完全一致。

> 写这套检查时踩了个坑值得记下来：`parseColor` 一开始只认 `rgb()`，不认 CSS 变量原样读出来的 `#rrggbb`，导致「变量当背景」全部解析成透明黑，算出的对比度是错的。**测量工具本身也必须被验证。**
>
> 另一个坑：`body` 上有 0.25s 颜色过渡，切完主题立刻测量读到的是动画中间态（会得到「文字是纯黑」这种失真结果）。测量前必须冻结过渡并强制重排。

### 6. `flex: 1` 的网格容器会把行"撑胖"，让内容凭空位移

收起右侧栏时窄屏出现过一个诡异现象：指板突然下移 245px，可上面只多了一条 33px 高的展开竖条。

根因是两件事叠加：

1. `.layout` 上有 `flex: 1`，会被撑满 `100vh - topbar` 的高度（不是由内容决定）
2. 网格的 `align-content` 默认是 `stretch`，**会把这多出来的空间平分给每一行**

于是内容从 1126px 缩到 554px 后，空出来的 384px 被两行各分走 192px：

```
187（首行顶） + 33（竖条） + 192（行被拉伸） + 20（间隙） = 432 = 实测 board-col.top ✅
```

修法是收起态加 `align-content: start`，让行高只按内容算。

> 注意只改收起态：展开态那点"拉伸"其实是有用的 —— `position: sticky` 的侧栏要靠它才有跟滚动的行程，全局改成 `start` 会让侧栏失去粘性。

### 7. 派生对象进依赖数组，会把下游 `useMemo` 整片打掉

自由调弦是「用户输入 → 构造 `Tuning` 对象」派生出来的。如果直接写成

```tsx
const tuning = tuningMode === 'free' ? makeCustomTuning(customStrings, preferFlat) : fixedTuning
```

那么**每次渲染都会得到一个全新的对象**。而下游的和弦指型搜索是以 `tuning` 为依赖的：

```tsx
const voicingsByBoard = useMemo(() => { /* findVoicings(...) */ }, [boards, tuning, ...])
```

引用一变，`useMemo` 就认为依赖变了，于是每个渲染周期都重跑一遍 DFS 指型搜索 ——
类型检查不会报错，界面看起来也正常，只是白白烧 CPU。所以那里必须包 `useMemo`，
让同一组输入返回同一个对象引用。

> 同一个坑的另一面：`makeCustomTuning` 刻意做成纯函数（同输入返回等价内容），
> 这样 `useMemo` 的依赖数组才写得对。要是在里面塞 `Date.now()` 或随机数，这个优化立刻就失效了。

---

## 部署到线上

**不需要后端。** 整个 `src/` 里没有任何网络请求（没有 `fetch` / `axios` / `XHR` /
`WebSocket` / `EventSource`），唯一的持久化是 `localStorage`，且只存主题与侧栏两个偏好
（见 `src/App.tsx` 的 `THEME_KEY` / `SIDE_KEY`）。三大功能都是确定性算法，在浏览器里
毫秒级算完 —— 这正是 `docs/ARCHITECTURE.md` 的结论「乐理计算 100% 放前端」。

所以 `npm run build` 产出的 `dist/` 就是一堆纯静态文件（约 74 KB gzip），
扔到任何静态托管上都能跑。**只有三类数据才需要后端**：账号、收藏与练习记录、
分享链接的短链 —— 见下一章。

### GitHub Pages（已配好，push 即部署）

`.github/workflows/deploy-pages.yml` 会在 push 到 `main` 时自动 `npm run build`
并把 `dist/` 发布到 <https://lingyu-OVO.github.io/fret_fec/>。workflow 里的构建步骤
含 `tsc -b`，类型检查不过就不会部署，等于顺带做了一道 CI 门禁。

首次运行**必须先手动开一次 Pages**：**Settings → Pages → Build and deployment → Source
选 `GitHub Actions`**（不要选 "Deploy from a branch"，那是旧的静态分支模式，会忽略 workflow
上传的 artifact）。

> **这一步不能靠 workflow 自动完成。** `actions/configure-pages` 有个 `enablement: true`
> 选项看似能自动开启，但官方 `action.yml` 写明它
> 「requires a token other than `GITHUB_TOKEN`」，而 workflow 默认拿到的就是
> `GITHUB_TOKEN` —— 它永远无法被授予 `administration:write`，强行加上只会得到
> 403 `Resource not accessible by integration` 并把 build job 搞挂。
> 所以 workflow 里没写这个选项，开 Pages 是纯粹的一次性手动操作。

> **`vite.config.ts` 里的 `base: './'` 是必须的。** Pages 项目站点在 `/<repo>/` 子路径下，
> Vite 默认的 `base: '/'` 会让产物引用 `/assets/...`，浏览器把它解析成
> `https://<user>.github.io/assets/...` → 404 → **白页**。
> 用相对路径 `'./'` 则对项目站点、自定义域名、Vercel/Netlify 根路径都成立。
> 这跟上面 `file://` 白页是同一类问题（路径解析），换了层皮 —— 而且它只影响
> **GitHub Pages 项目站点**，部署在域名根路径的平台不会遇到。

### 其他托管平台

Vercel / Netlify / Cloudflare Pages 都部署在**域名根路径**，默认 `base` 反而是对的。
它们能自动识别 Vite 项目（构建命令 `npm run build`、输出目录 `dist`），
连上仓库点两下就完事，比 Pages 少一个开 Pages 的步骤。

### 不想配 CI 的极简方案

`npm run build:single` 产出的 `Fretboard-Lab.html` 实测**零外部资源引用**
（0 个外部 `script src`、0 个外部 `link href`、不含 `/assets/`），零路径依赖，
放任何子目录都能跑。把它提交进仓库并开启 Pages，直接访问
`/fret_fec/Fretboard-Lab.html` 就有一个能玩的在线链接，完全不需要 workflow。
代价是 228 KB 构建产物入库，改源码后要记得重新生成再提交。

> 两条路线的差别：CI 方案发布的是 `dist/`（ES module，需要 http 环境），
> 极简方案发布的是内联成传统 `<script>` 的单文件（连 `file://` 都能跑）。
> 前者是正常的工程做法，后者适合「我就想马上有个链接发给朋友」。

---

## 后端与数据库选型（结论）

完整论证见 `docs/ARCHITECTURE.md` 第 5 章。

**核心判断：乐理计算 100% 放前端。** 三大功能都是确定性算法、输入空间极小、毫秒级完成，放后端只会引入延迟和成本。后端只负责「需要跨设备、持久化、共享」的三类数据：账号、收藏与练习记录、分享链接。

| 阶段 | 方案 | 理由 |
| --- | --- | --- |
| **MVP（现在）** | 纯前端 + localStorage + URL 分享 | 零后端、零月费，三大功能已经 100% 可用 |
| **V1（推荐）** | **Supabase**（Postgres + Auth + RLS + Realtime） | 省掉 70% 后端样板；数据层是标准 Postgres，随时 `pg_dump` 迁走，无锁定 |
| **V2（按需）** | 自建 Node.js + **Fastify** + PostgreSQL | 只在出现「SEO 刚需 / 服务端复用乐理代码（monorepo 共享 `packages/theory`）/ 合规自托管」时才值得 |
| 备选 | Cloudflare Workers + D1 | 边缘延迟好、免费额度大；但 SQLite 方言无 JSONB、无内置 Auth/RLS |

**数据库选 PostgreSQL，不选 MongoDB。** 指板数据的本质是「强 schema 的数组 + 多对多关系」（用户-收藏-和弦-标签），需要外键、唯一约束、JOIN；MongoDB 在这里丢掉关系能力却换不来收益。和弦指型这类半结构化数组用 Postgres 的 `JSONB` 就能覆盖，两全其美。

> 已实现的 URL 状态编码（`src/state/url.ts`）就是「分享链接」功能的雏形，接入后端后可以直接换成短链表。

---

## 已知边界

- 24 品全显示时指板会很宽，纵向会变扁；建议 12–15 品
- 移动端触摸热区按 44px 设计目标做了放大，但还没做双指缩放
- 指型生成目前是主线程同步计算，加缓存在 100ms 内；若要支持「一次列出所有和弦的指型」需要搬到 Web Worker
- 尚未做键盘无障碍导航（方向键移动焦点）

---

## License

[MIT](LICENSE) © 2026 lingyu-OVO

可自由使用、修改、分发、商用，只需保留版权与许可声明。

> 关于指型数据的说明见 `docs/ARCHITECTURE.md` 的风险表 R14：官方指型库全部由
> `src/theory/voicings.ts` **算法生成**，不抓取教材或竞品数据，因此生成结果本身
> 无第三方版权负担 —— 这也是自研 DFS 生成算法（ADR-07）的附加价值。
