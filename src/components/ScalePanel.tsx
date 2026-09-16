import { KEY_CHOICES } from '../theory/notes'
import { SCALES, SCALE_BY_ID, SCALE_CATEGORY_LABEL, buildScale, type ScaleCategory } from '../theory/scales'
import { Chip, Field, Panel, Segmented, Select, Switch } from './Controls'

export const POSITION_WINDOWS = [
  { id: 'all', label: '全指板', start: 0, end: 24 },
  { id: 'open', label: '开放把位 (0-4)', start: 0, end: 4 },
  { id: 'p3', label: '3 品把位 (3-7)', start: 3, end: 7 },
  { id: 'p5', label: '5 品把位 (5-9)', start: 5, end: 9 },
  { id: 'p7', label: '7 品把位 (7-11)', start: 7, end: 11 },
  { id: 'p9', label: '9 品把位 (9-13)', start: 9, end: 13 },
  { id: 'p12', label: '12 品把位 (12-16)', start: 12, end: 16 },
]

export interface ScalePanelProps {
  keyPc: number
  keyLetterIdx: number
  scaleId: string
  showDegrees: boolean
  onlyRoots: boolean
  showOutside: boolean
  positionWindowId: string
  onChangeKey: (pc: number, letterIdx: number) => void
  onChangeScale: (id: string) => void
  onToggleDegrees: (v: boolean) => void
  onToggleRoots: (v: boolean) => void
  onToggleOutside: (v: boolean) => void
  onChangeWindow: (id: string) => void
  onPlayScale: () => void
}

export function ScalePanel({
  keyPc,
  keyLetterIdx,
  scaleId,
  showDegrees,
  onlyRoots,
  showOutside,
  positionWindowId,
  onChangeKey,
  onChangeScale,
  onToggleDegrees,
  onToggleRoots,
  onToggleOutside,
  onChangeWindow,
  onPlayScale,
}: ScalePanelProps) {
  const def = SCALE_BY_ID[scaleId] ?? SCALES[0]
  const tones = buildScale(keyPc, keyLetterIdx, def)

  const categories = [...new Set(SCALES.map((s) => s.category))] as ScaleCategory[]
  const scaleOptions = categories.flatMap((cat) =>
    SCALES.filter((s) => s.category === cat).map((s) => ({
      value: s.id,
      label: `${s.name} · ${s.nameEn}`,
      group: SCALE_CATEGORY_LABEL[cat],
    })),
  )

  return (
    <Panel
      title="音阶模式"
      subtitle="选一个调和一个调式，整块指板点亮这个音阶的所有音"
      actions={<Chip onClick={onPlayScale} title="从低到高播放这个音阶">▶ 试听音阶</Chip>}
    >
      <div className="grid-2">
        <Field label="调（主音）">
          <Select
            value={keyPc}
            onChange={(v) => {
              const k = KEY_CHOICES.find((x) => x.pc === v)!
              onChangeKey(k.pc, k.letterIdx)
            }}
            options={KEY_CHOICES.map((k) => ({ value: k.pc, label: k.name }))}
            ariaLabel="选择调"
          />
        </Field>
        <Field label="调式 / 音阶">
          <Select value={scaleId} onChange={onChangeScale} options={scaleOptions} ariaLabel="选择调式" />
        </Field>
      </div>

      <p className="scale-desc">{def.desc}</p>

      <div className="scale-tones">
        {tones.map((t) => (
          <span key={t.index} className={`tone-chip${t.degree === '1' ? ' is-root' : ''}`} title={`相对主音 ${t.interval} 个半音`}>
            <b>{t.name}</b>
            <em>{t.degree}</em>
          </span>
        ))}
      </div>

      <div className="switch-row">
        <Switch checked={showDegrees} onChange={onToggleDegrees} label="显示音级" title="把音名换成 1 2 b3 4 5 b6 b7，看清音阶结构" />
        <Switch checked={onlyRoots} onChange={onToggleRoots} label="只显示主音" title="只留下主音位置，先记住根音在指板上的分布" />
        <Switch checked={showOutside} onChange={onToggleOutside} label="标出音阶外音" title="把不属于这个音阶的位置也用暗色标出来，方便对比" />
      </div>

      <Field label="把位范围" hint="只练一个把位时用">
        <Segmented
          value={positionWindowId}
          onChange={onChangeWindow}
          options={POSITION_WINDOWS.map((w) => ({ value: w.id, label: w.label.replace(/\s*\(.*\)/, ''), title: w.label }))}
        />
      </Field>

      <div className="legend">
        <span className="legend-item"><i className="dot dot-root" />主音 {tones[0]?.name}</span>
        <span className="legend-item"><i className="dot dot-tone" />音阶内音</span>
        {showOutside && <span className="legend-item"><i className="dot dot-ghost" />音阶外音</span>}
      </div>
    </Panel>
  )
}
