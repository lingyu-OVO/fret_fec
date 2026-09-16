/**
 * verify-theory.ts — 乐理引擎自检
 * 用 `npm run verify` 运行（脚本会先 esbuild 打包再用 node 执行）。
 *
 * 这些用例是整个项目的地基，一旦回归就说明音名拼写 / 识别 / 指型生成三者之一坏了。
 */

import { buildScale, SCALE_BY_ID } from '../src/theory/scales'
import { identifyChord, parseChordSymbol } from '../src/theory/chords'
import { findVoicings, voicingToTabText } from '../src/theory/voicings'
import { TUNING_BY_ID } from '../src/theory/tunings'
import { KEY_CHOICES } from '../src/theory/notes'

let pass = 0
let fail = 0
const failures: string[] = []

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    pass++
  } else {
    fail++
    failures.push(`  ✗ ${label}\n      实际: ${a}\n      期望: ${e}`)
  }
}

function checkTrue(label: string, cond: boolean, detail = '') {
  if (cond) pass++
  else {
    fail++
    failures.push(`  ✗ ${label}${detail ? `\n      ${detail}` : ''}`)
  }
}

/** KEY_CHOICES 之外的等音调（如 Gb / Cb）手动补，用于验证拼写算法本身 */
const EXTRA_KEYS: Record<string, { pc: number; letterIdx: number; name: string }> = {
  Gb: { pc: 6, letterIdx: 4, name: 'Gb' }, // 字母 G 的下标是 4（LETTERS = C D E F G A B）
  Cb: { pc: 11, letterIdx: 0, name: 'Cb' },
  'C#': { pc: 1, letterIdx: 0, name: 'C#' },
}

function key(name: string) {
  const k = KEY_CHOICES.find((x) => x.name === name) ?? EXTRA_KEYS[name]
  if (!k) throw new Error(`未知调: ${name}`)
  return k
}

const std = TUNING_BY_ID['standard-e']

// ─────────────────────────────────────────────────────────
console.log('\n【1】音名拼写：必须按音级字母推导，不能查 12 音名表')
// ─────────────────────────────────────────────────────────

const maj = SCALE_BY_ID['ionian']
const names = (k: string, id: string) => {
  const kk = key(k)
  return buildScale(kk.pc, kk.letterIdx, SCALE_BY_ID[id]).map((t) => t.name)
}

check('F 大调（关键：第 4 级必须是 Bb，不是 A#）', names('F', 'ionian'), ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'])
check('C 大调', names('C', 'ionian'), ['C', 'D', 'E', 'F', 'G', 'A', 'B'])
check('Bb 大调（两级降号）', names('Bb', 'ionian'), ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'])
check('Eb 大调（三级降号）', names('Eb', 'ionian'), ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'])
check('F# 大调（全是升号，含 E#）', names('F#', 'ionian'), ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#'])
check('Gb 大调（全是降号，含 Cb）', names('Gb', 'ionian'), ['Gb', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F'])

// 布鲁斯音阶的 b5：同一个音，但在 5 级字母上写降号 → Gb 而不是 F#
check('C 布鲁斯（b5 必须是 Gb 不是 F#）', names('C', 'minor-blues'), ['C', 'Eb', 'F', 'Gb', 'G', 'Bb'])
check('A 布鲁斯', names('A', 'minor-blues'), ['A', 'C', 'D', 'Eb', 'E', 'G'])
check('C 小调五声', names('C', 'minor-pentatonic'), ['C', 'Eb', 'F', 'G', 'Bb'])
check('A 小调五声', names('A', 'minor-pentatonic'), ['A', 'C', 'D', 'E', 'G'])
check('C 和声小调', names('C', 'harmonic-minor'), ['C', 'D', 'Eb', 'F', 'G', 'Ab', 'B'])
check('C 全音阶', names('C', 'whole-tone'), ['C', 'D', 'E', 'F#', 'G#', 'A#'])
check('C 减音阶（全半，8 个音）', names('C', 'dim-wh'), ['C', 'D', 'Eb', 'F', 'Gb', 'Ab', 'A', 'B'])
check('C 变化音阶', names('C', 'altered'), ['C', 'Db', 'D#', 'E', 'Gb', 'G#', 'Bb'])
check('E 洛克里亚', names('E', 'locrian'), ['E', 'F', 'G', 'A', 'Bb', 'C', 'D'])

// 每个音阶在所有 12 个调下都能生成、音数正确、首音等于主音
let scaleOk = true
let scaleDetail = ''
for (const k of KEY_CHOICES) {
  for (const def of Object.values(SCALE_BY_ID)) {
    const tones = buildScale(k.pc, k.letterIdx, def)
    if (tones.length !== def.intervals.length) {
      scaleOk = false
      scaleDetail = `${k.name} ${def.id} 音数不符`
    }
    if (tones[0].name !== k.name) {
      // Bb 大调主音写作 Bb，KEY_CHOICES 里也是 Bb，应一致
      scaleOk = false
      scaleDetail = `${k.name} ${def.id} 主音拼成 ${tones[0].name}`
    }
    if (new Set(tones.map((t) => t.pc)).size !== tones.length) {
      scaleOk = false
      scaleDetail = `${k.name} ${def.id} 出现重复音高`
    }
  }
}
checkTrue('全部 12 调 × 全部音阶生成自洽', scaleOk, scaleDetail)

// ─────────────────────────────────────────────────────────
console.log('【2】和弦识别')
// ─────────────────────────────────────────────────────────

const top = (...pcsInOrder: number[]) => {
  // 第一个音是最低音，后续依次升高，这样 bassPc 才可控
  const played = pcsInOrder.map((p, i) => ({ pc: p, midi: 40 + i * 3 }))
  const r = identifyChord(played, {})
  return r.candidates[0]?.fullSymbol ?? `<未识别: ${r.fallbackDesc}>`
}

check('C E G → C', top(0, 4, 7), 'C')
check('C Eb G → Cm', top(0, 3, 7), 'Cm')
check('C E G Bb → C7', top(0, 4, 7, 10), 'C7')
check('C E G B → Cmaj7', top(0, 4, 7, 11), 'Cmaj7')
check('C Eb G Bb → Cm7', top(0, 3, 7, 10), 'Cm7')
check('C Eb Gb Bb → Cm7b5', top(0, 3, 6, 10), 'Cm7b5')
check('C Eb Gb A → Cdim7', top(0, 3, 6, 9), 'Cdim7')
check('C F G → Csus4', top(0, 5, 7), 'Csus4')
check('C D G → Csus2', top(0, 2, 7), 'Csus2')
check('C G → C5（强力和弦）', top(0, 7), 'C5')
check('C E G# → Caug', top(0, 4, 8), 'Caug')
check('C E Bb（省五音的属七）→ C7', top(0, 4, 10), 'C7')
check('C E G A 低音 C → C6', top(0, 4, 7, 9), 'C6')
check('A C E G 低音 A → Am7（同一堆音，低音决定读法）', top(9, 0, 4, 7), 'Am7')
check('G C E A 低音 G → Am7/G', top(7, 0, 4, 9), 'Am7/G')
check('C E G Bb D → C9', top(0, 2, 4, 7, 10), 'C9')
check('E G Bb C# 低音 E → Edim7（减七和弦对称，四个根音等价）', top(4, 7, 10, 1), 'Edim7')
check('F A C E → Fmaj7', top(5, 9, 0, 4), 'Fmaj7')
check('Bb D F → Bb', top(10, 2, 5), 'Bb')

// {C,E,G,A} 低音是 E：E 是 C6 的三音、却是 Am7 的五音，两种读法都成立，
// 应用里会同时列出，这里只要求「C6/E 必须出现在前二」
const ambiguous = identifyChord([
  { pc: 4, midi: 40 }, { pc: 0, midi: 44 }, { pc: 7, midi: 47 }, { pc: 9, midi: 50 },
])
checkTrue(
  '{C,E,G,A} 低音 E：C6/E 与 Am7/E 都在前二（真实歧义）',
  ambiguous.candidates.slice(0, 2).some((c) => c.fullSymbol === 'C6/E') &&
    ambiguous.candidates.slice(0, 2).some((c) => c.fullSymbol === 'Am7/E'),
  `实际前二: ${ambiguous.candidates.slice(0, 2).map((c) => `${c.fullSymbol}(${c.score})`).join(' ')}`,
)

const r1 = identifyChord([{ pc: 0, midi: 40 }, { pc: 4, midi: 44 }, { pc: 7, midi: 47 }])
checkTrue('C E G 是完美匹配', r1.candidates[0]?.perfect === true)
checkTrue('C E G 的候选里 C 排第一且分数最高', r1.candidates[0]?.symbol === 'C' && r1.candidates[0].score > (r1.candidates[1]?.score ?? -Infinity))

const r2 = identifyChord([{ pc: 0, midi: 40 }, { pc: 4, midi: 44 }, { pc: 7, midi: 47 }, { pc: 10, midi: 50 }])
checkTrue('C7 不会报告缺失五音（五音在场）', r2.candidates[0]?.missing.length === 0)

const r3 = identifyChord([{ pc: 0, midi: 40 }, { pc: 4, midi: 44 }, { pc: 10, midi: 47 }])
const r3c = r3.candidates[0]
checkTrue(
  'C E Bb 识别为 C7 并报告缺失五音',
  r3c?.suffix === '7' && r3c.missing.includes(7),
  `suffix=${JSON.stringify(r3c?.suffix)} (期望 "7") / missing=${JSON.stringify(r3c?.missing)} / includes7=${r3c?.missing.includes(7)} / 候选=${r3.candidates.map((c) => `${c.fullSymbol}(${c.score})`).join(' ')}`,
)

const r4 = identifyChord([{ pc: 0, midi: 40 }])
checkTrue('单音不返回和弦候选', r4.candidates.length === 0 && r4.fallbackDesc !== null)

const r5 = identifyChord([])
checkTrue('空输入安全返回', r5.candidates.length === 0)

// 相对阈值过滤：C E G 里三音俱全，不该再冒出 Em/C 这种硬凑读法
const r6 = identifyChord([
  { pc: 0, midi: 40 }, { pc: 4, midi: 44 }, { pc: 7, midi: 47 },
])
checkTrue(
  'C E G 只给出 C 这一个候选（分数差距过大的读法被过滤）',
  r6.candidates.length === 1 && r6.candidates[0].fullSymbol === 'C',
  `实际: ${r6.candidates.map((c) => `${c.fullSymbol}(${c.score})`).join(' ')}`,
)

// 真正的歧义不能被过滤掉
const r7 = identifyChord([
  { pc: 0, midi: 40 }, { pc: 4, midi: 44 }, { pc: 7, midi: 47 }, { pc: 9, midi: 50 },
])
checkTrue(
  'C6 / Am7/C 的真实歧义被保留（≥2 个候选）',
  r7.candidates.length >= 2,
  `实际: ${r7.candidates.map((c) => `${c.fullSymbol}(${c.score})`).join(' ')}`,
)

// ─────────────────────────────────────────────────────────
console.log('【3】和弦符号解析')
// ─────────────────────────────────────────────────────────

check('Cmaj7', parseChordSymbol('Cmaj7')?.symbol, 'Cmaj7')
check('F#m7b5', parseChordSymbol('F#m7b5')?.symbol, 'F#m7b5')
check('Bb7#9', parseChordSymbol('Bb7#9')?.symbol, 'Bb7#9')
check('Am', parseChordSymbol('Am')?.symbol, 'Am')
check('G', parseChordSymbol('G')?.symbol, 'G')
check('CΔ7（Δ 归一化为 maj7）', parseChordSymbol('CΔ7')?.symbol, 'Cmaj7')
check('A-7（爵士减号写法）', parseChordSymbol('A-7')?.symbol, 'Am7')
check('Cø（半减）', parseChordSymbol('Cø')?.symbol, 'Cm7b5')
check('乱输入返回 null', parseChordSymbol('Hxyz'), null)

// ─────────────────────────────────────────────────────────
console.log('【4】指型生成')
// ─────────────────────────────────────────────────────────

const t0 = Date.now()
const cMaj = findVoicings({ id: 'maj', suffix: '', nameZh: '', category: 'triad', intervals: [0, 4, 7], essential: [0, 4], priority: 100 }, 0, std)
const elapsed = Date.now() - t0

const tabs = cMaj.map(voicingToTabText)
checkTrue('C 大三和弦找到 ≥ 15 个指型', cMaj.length >= 15, `实际 ${cMaj.length} 个`)
checkTrue('包含经典开放按法 x32010', tabs.includes('x32010'), `前 10 个: ${tabs.slice(0, 10).join(' ')}`)
checkTrue('包含大横按 8-10-10-9-8-8 (x35553)', tabs.includes('x35553'), `前 20 个: ${tabs.slice(0, 20).join(' ')}`)
checkTrue('枚举耗时 < 400ms', elapsed < 400, `实际 ${elapsed}ms`)
checkTrue('所有指型的低音都是根音', cMaj.every((v) => v.bassIsRoot))
checkTrue('所有指型跨度 ≤ 4', cMaj.every((v) => v.span <= 4))
checkTrue('所有指型发声弦数 ≥ 4', cMaj.every((v) => v.sounding >= 4))
checkTrue('所有指型都含特征音（根音+三音）', cMaj.every((v) => v.intervals.includes(0) && v.intervals.includes(4)))

const t1 = Date.now()
const eMin = findVoicings({ id: 'min', suffix: 'm', nameZh: '', category: 'triad', intervals: [0, 3, 7], essential: [0, 3], priority: 98 }, 4, std)
const elapsed1 = Date.now() - t1
const tabs1 = eMin.map(voicingToTabText)
checkTrue('Em 包含经典开放按法 022000', tabs1.includes('022000'), `前 10 个: ${tabs1.slice(0, 10).join(' ')}`)
checkTrue('Em 包含 022100? 不，那是 E 大三', !tabs1.includes('022100'))
checkTrue('Em 枚举耗时 < 400ms', elapsed1 < 400, `实际 ${elapsed1}ms`)

const fMaj = findVoicings({ id: 'maj', suffix: '', nameZh: '', category: 'triad', intervals: [0, 4, 7], essential: [0, 4], priority: 100 }, 5, std)
const fTabs = fMaj.map(voicingToTabText)
checkTrue('F 大三和弦包含大横按 133211', fTabs.includes('133211'), `前 10 个: ${fTabs.slice(0, 10).join(' ')}`)

// 七和弦
const t2 = Date.now()
const c7 = findVoicings({ id: '7', suffix: '7', nameZh: '', category: 'seventh', intervals: [0, 4, 7, 10], essential: [0, 4, 10], priority: 96 }, 0, std)
const e2 = Date.now() - t2
const c7Tabs = c7.map(voicingToTabText)
checkTrue('C7 包含开放按法 x32310', c7Tabs.includes('x32310'), `前 10 个: ${c7Tabs.slice(0, 10).join(' ')}`)
checkTrue('C7 枚举耗时 < 600ms', e2 < 600, `实际 ${e2}ms`)

// 允许转位的模式
const inv = findVoicings(
  { id: 'maj', suffix: '', nameZh: '', category: 'triad', intervals: [0, 4, 7], essential: [0, 4], priority: 100 },
  0, std, { requireRootInBass: false, limit: 200 },
)
checkTrue('关闭低音限制后能找到更多指型', inv.length > cMaj.length, `转位 ${inv.length} 个 vs 原位上限 ${cMaj.length} 个`)
checkTrue('关闭低音限制后存在非根音低音指型（转位）', inv.some((v) => !v.bassIsRoot))

// 七弦吉他不应崩
const seven = TUNING_BY_ID['seven-string']
const sevenV = findVoicings({ id: 'maj', suffix: '', nameZh: '', category: 'triad', intervals: [0, 4, 7], essential: [0, 4], priority: 100 }, 0, seven, { limit: 10 })
checkTrue('七弦吉他指型生成正常', sevenV.length > 0)

// ─────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(62))
if (fail === 0) {
  console.log(`✅ 全部通过：${pass} 项断言`)
} else {
  console.log(`❌ ${fail} 项失败 / 共 ${pass + fail} 项\n`)
  console.log(failures.join('\n'))
}
console.log('═'.repeat(62) + '\n')

process.exit(fail === 0 ? 0 : 1)
