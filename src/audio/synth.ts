/**
 * synth.ts — Karplus-Strong 拨弦合成
 *
 * 为什么不用采样：省掉几 MB 音频资源，且任意音高都能发声（24 品 + 各种调弦）。
 * Karplus-Strong 原理：往延迟线里灌一段噪声，然后反复做「相邻两点平均」——
 * 平均是低通，高频每轮衰减得比低频快，于是噪声自然收敛成基频为 sr/N 的拨弦音。
 *
 * 渲染成 AudioBuffer 而不是用 DelayNode 反馈环，是为了：
 *   ① 结果确定、可缓存，同一个音重复播放不重复计算
 *   ② 不受浏览器反馈环最小延迟限制（高把位的高音 cycle 极短，反馈环会失真）
 */

import { midiToFreq } from '../theory/notes'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let enabled = true

const cache = new Map<string, AudioBuffer>()

function getCtx(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0.5
    // 一点点空气感：轻微的板式混响用短延迟近似
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function setAudioEnabled(on: boolean): void {
  enabled = on
  if (master) master.gain.value = on ? 0.5 : 0
}

export function isAudioEnabled(): boolean {
  return enabled
}

/** 首次用户交互时解锁音频（浏览器自动播放策略） */
export function unlockAudio(): void {
  try {
    getCtx()
  } catch {
    /* 无音频设备时静默降级 */
  }
}

const DAMP = 0.9965
const DURATION = 2.2

/**
 * 渲染一个拨弦音。midi 越高，延迟线越短，衰减越快——和真实吉他一致。
 */
function renderPluck(midi: number, sampleRate: number): AudioBuffer {
  const key = `${midi}@${sampleRate}`
  const hit = cache.get(key)
  if (hit) return hit

  const ac = getCtx()
  const freq = midiToFreq(midi)
  // 延迟线长度 = 一个周期；低于 2 会失去物理意义
  const N = Math.max(2, Math.round(sampleRate / freq))
  const total = Math.ceil(DURATION * sampleRate)
  const buffer = ac.createBuffer(1, total, sampleRate)
  const out = buffer.getChannelData(0)

  // ① 激励：带一点低通的白噪声，模拟拨片而不是纯噪声
  const line = new Float32Array(N)
  let prev = 0
  for (let i = 0; i < N; i++) {
    const w = Math.random() * 2 - 1
    prev = prev * 0.45 + w * 0.55
    line[i] = prev
  }
  // 拨弦位置：靠近琴桥 → 更亮。这里给一点梳状滤波的染色
  const pickOffset = Math.max(1, Math.round(N * 0.13))
  for (let i = 0; i < N; i++) {
    const shifted = line[(i + pickOffset) % N]
    line[i] = line[i] - shifted * 0.5
  }

  // ② Karplus-Strong 主循环
  let idx = 0
  for (let i = 0; i < total; i++) {
    const cur = line[idx]
    const nxt = line[(idx + 1) % N]
    out[i] = cur
    line[idx] = (cur + nxt) * 0.5 * DAMP
    idx = (idx + 1) % N
  }

  // ③ 包络：去掉起音爆点 + 尾部淡出，避免咔嗒声
  const attack = Math.min(64, Math.floor(total * 0.002))
  for (let i = 0; i < attack; i++) out[i] *= i / attack
  const tail = Math.floor(total * 0.25)
  for (let i = 0; i < tail; i++) {
    out[total - 1 - i] *= i / tail
  }

  // ④ 归一化到 -1..1 附近
  let peak = 0
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) {
    const g = 0.85 / peak
    for (let i = 0; i < total; i++) out[i] *= g
  }

  cache.set(key, buffer)
  return buffer
}

export interface PluckOptions {
  /** 相对当前时间的延迟（秒） */
  delay?: number
  /** 音量 */
  gain?: number
  /** 声像 -1（左）~ 1（右） */
  pan?: number
}

/** 播一个音 */
export function pluck(midi: number, opts: PluckOptions = {}): void {
  if (!enabled) return
  let ac: AudioContext
  try {
    ac = getCtx()
  } catch {
    return
  }
  const { delay = 0, gain = 0.22, pan = 0 } = opts
  const buf = renderPluck(midi, ac.sampleRate)

  const src = ac.createBufferSource()
  src.buffer = buf
  const g = ac.createGain()
  g.gain.value = gain
  const panner = ac.createStereoPanner()
  panner.pan.value = Math.max(-1, Math.min(1, pan))

  src.connect(g)
  g.connect(panner)
  panner.connect(master!)

  const t = ac.currentTime + delay
  src.start(t)
  src.stop(t + buf.duration)
}

/**
 * 扫弦：按弦序依次延迟，模拟真实下扫。
 * @param midis 从低音弦到高音弦的音高（null = 闷音跳过）
 */
export function strum(midis: (number | null)[], direction: 'down' | 'up' = 'down'): void {
  if (!enabled) return
  const sounding = midis.filter((m): m is number => m !== null)
  const n = Math.max(1, sounding.length)
  const step = 0.028
  let i = 0
  const ordered = direction === 'down' ? midis : [...midis].reverse()
  for (const m of ordered) {
    if (m === null) continue
    const idx = direction === 'down' ? i : n - 1 - i
    pluck(m, {
      delay: i * step,
      gain: 0.17,
      pan: n > 1 ? (idx / (n - 1)) * 1.2 - 0.6 : 0,
    })
    i++
  }
}

/** 同时播一组音（和声，不扫弦） */
export function playChord(midis: number[]): void {
  midis.forEach((m, i) => pluck(m, { gain: 0.16, pan: midis.length > 1 ? (i / (midis.length - 1)) * 1.2 - 0.6 : 0 }))
}
