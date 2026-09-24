/**
 * TuningPanel.tsx — 右侧栏的调弦设置面板
 *
 * 两种模式：
 *   固定调弦 —— 从内置调弦表里选一条（六弦吉他 / 七弦吉他 / 贝斯）
 *   自由调弦 —— 逐弦指定音高，弦数 4~7 可调
 *
 * 调弦是全局设置（对上面所有指板同时生效），所以放在右侧栏而不是每块指板上。
 */

import { useMemo } from 'react'
import {
  MAX_STRINGS,
  MIN_STRINGS,
  TUNINGS,
  midiNoteName,
  resizeStrings,
  stringLabel,
  stringPitchOptions,
  tuningGroup,
  type Tuning,
  type TuningMode,
} from '../theory/tunings'
import { Chip, Field, Panel, Segmented, Select } from './Controls'

export interface TuningPanelProps {
  mode: TuningMode
  tuningId: string
  /** 当前实际生效的调弦（自由模式下是由 customStrings 构造出来的对象） */
  tuning: Tuning
  customStrings: number[]
  preferFlat: boolean
  onChangeMode: (m: TuningMode) => void
  onChangeTuningId: (id: string) => void
  onChangeStrings: (strings: number[]) => void
}

export function TuningPanel({
  mode,
  tuningId,
  tuning,
  customStrings,
  preferFlat,
  onChangeMode,
  onChangeTuningId,
  onChangeStrings,
}: TuningPanelProps) {
  // 61 个候选音高，只在升降号偏好变化时重建
  const pitches = useMemo(() => stringPitchOptions(preferFlat), [preferFlat])

  const stringCountOptions = useMemo(
    () =>
      Array.from({ length: MAX_STRINGS - MIN_STRINGS + 1 }, (_, i) => MIN_STRINGS + i).map((n) => ({
        value: n,
        label: `${n} 弦`,
      })),
    [],
  )

  const fixedOptions = useMemo(
    () => TUNINGS.map((t) => ({ value: t.id, label: t.name, group: tuningGroup(t) })),
    [],
  )

  // 高音弦在上、低音弦在下，和指板的视觉方向一致
  const rows = useMemo(
    () => customStrings.map((midi, s) => ({ s, midi, label: stringLabel(tuning, s) })).reverse(),
    [customStrings, tuning],
  )

  const fixedDef = TUNINGS.find((t) => t.id === tuningId)
  const notesText = customStrings.map((m) => midiNoteName(m, preferFlat)).join(' ')

  return (
    <Panel
      title="调弦"
      subtitle="对整个页面的所有指板生效"
      actions={
        mode === 'free' && fixedDef ? (
          <Chip
            onClick={() => onChangeStrings(resizeStrings([...fixedDef.strings], customStrings.length))}
            title={`把各弦音高设成「${fixedDef.name}」，弦数保持不变`}
          >
            复制固定调弦
          </Chip>
        ) : undefined
      }
    >
      <Field label="调弦模式" hint="固定选常用调弦，或逐弦自己定">
        <Segmented
          value={mode}
          onChange={onChangeMode}
          options={[
            { value: 'fixed' as TuningMode, label: '固定调弦', title: '从内置调弦表里选' },
            { value: 'free' as TuningMode, label: '自由调弦', title: '逐弦指定音高，弦数 4~7 可调' },
          ]}
        />
      </Field>

      {mode === 'fixed' ? (
        <>
          <Field label="调弦">
            <Select
              value={tuningId}
              onChange={onChangeTuningId}
              options={fixedOptions}
              ariaLabel="选择调弦"
            />
          </Field>
          {fixedDef && (
            <p className="panel-foot">
              {fixedDef.desc}
              <br />
              从低到高 <b>{fixedDef.strings.map((m) => midiNoteName(m, preferFlat)).join(' ')}</b>
            </p>
          )}
        </>
      ) : (
        <>
          <Field label="弦数" hint={`${MIN_STRINGS}~${MAX_STRINGS} 弦，加弦时自动补一根低四度的弦`}>
            <Select
              value={customStrings.length}
              onChange={(n) => onChangeStrings(resizeStrings(customStrings, n))}
              options={stringCountOptions}
              ariaLabel="自由调弦弦数"
            />
          </Field>

          <div className="string-picks">
            {rows.map((r) => (
              <label className="string-pick" key={r.s}>
                <span className="string-pick-label">{r.label} 弦</span>
                <Select
                  value={r.midi}
                  onChange={(v) => {
                    const next = [...customStrings]
                    next[r.s] = v
                    onChangeStrings(next)
                  }}
                  options={pitches}
                  ariaLabel={`${r.label} 弦音高`}
                />
              </label>
            ))}
          </div>

          <p className="panel-foot">
            从低到高 <b>{notesText}</b>（共 {tuning.strings.length} 弦）。
            音名拼写跟随顶栏的 ♯/♭ 偏好。
          </p>
        </>
      )}
    </Panel>
  )
}
