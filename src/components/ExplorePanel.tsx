import { KEY_CHOICES, defaultSpell, midiToFreq, midiToOctave, pc as toPc } from '../theory/notes'
import { noteAt, stringLabel, type Tuning } from '../theory/tunings'
import { Chip, Field, Panel, Select, Switch } from './Controls'

/** 相对大调音阶的音级标签，用来描述任意音与参考调的关系 */
const DEGREE_FROM_MAJOR = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7']

export interface ExplorePanelProps {
  tuning: Tuning
  selection: { stringIdx: number; fret: number }[]
  showAllNotes: boolean
  naturalsOnly: boolean
  preferFlat: boolean
  refKeyPc: number
  onChangeRefKey: (pc: number, letterIdx: number) => void
  onToggleAll: (v: boolean) => void
  onToggleNaturals: (v: boolean) => void
  onClear: () => void
  onPlay: (midi: number) => void
}

export function ExplorePanel({
  tuning,
  selection,
  showAllNotes,
  naturalsOnly,
  preferFlat,
  refKeyPc,
  onChangeRefKey,
  onToggleAll,
  onToggleNaturals,
  onClear,
  onPlay,
}: ExplorePanelProps) {
  const refKeyName = KEY_CHOICES.find((k) => k.pc === refKeyPc)?.name ?? 'C'
  const rows = selection
    .map((cell) => {
      const midi = noteAt(tuning, cell.stringIdx, cell.fret)
      const p = toPc(midi)
      return {
        ...cell,
        midi,
        name: defaultSpell(p, preferFlat),
        octave: midiToOctave(midi),
        freq: midiToFreq(midi),
        degree: DEGREE_FROM_MAJOR[(p - refKeyPc + 12) % 12],
      }
    })
    .sort((a, b) => a.midi - b.midi)

  return (
    <Panel
      title="指板探索"
      subtitle="点任意一品，看这个位置是什么音"
      actions={
        selection.length > 0 ? (
          <Chip onClick={onClear} title="清空所有标记">
            清空 ({selection.length})
          </Chip>
        ) : null
      }
    >
      <div className="switch-row">
        <Switch checked={showAllNotes} onChange={onToggleAll} label="显示全部音名" title="整块指板都标出音名，用来建立视觉记忆" />
        <Switch
          checked={naturalsOnly}
          onChange={onToggleNaturals}
          label="只要自然音"
          title="隐藏所有升降音，只留 C D E F G A B，初学者先从这 7 个音开始"
        />
      </div>

      <Field label="参考调" hint="下面「音级」一列以它为 1">
        <Select
          value={refKeyPc}
          onChange={(v) => {
            const k = KEY_CHOICES.find((x) => x.pc === v)!
            onChangeRefKey(k.pc, k.letterIdx)
          }}
          options={KEY_CHOICES.map((k) => ({ value: k.pc, label: `${k.name} 大调` }))}
          ariaLabel="参考调"
        />
      </Field>

      {rows.length === 0 ? (
        <p className="empty-hint">
          在上方指板上点击任意位置。
          {naturalsOnly && '「只要自然音」已开启，升降音位置点不亮。'}
        </p>
      ) : (
        <>
          <ul className="note-list">
            {rows.map((r) => (
              <li key={`${r.stringIdx}-${r.fret}`} className="note-row" onClick={() => onPlay(r.midi)} role="button" tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onPlay(r.midi)} title="点击试听">
                <span className="note-name">{r.name}</span>
                <span className="note-oct">{r.octave}</span>
                <span className="note-meta">
                  {stringLabel(tuning, r.stringIdx)} 弦 {r.fret === 0 ? '空弦' : `${r.fret} 品`}
                </span>
                <span className="note-degree" title={`在 ${refKeyName} 大调里的音级`}>
                  {r.degree}
                </span>
                <span className="note-freq">{r.freq.toFixed(1)} Hz</span>
              </li>
            ))}
          </ul>
          <p className="panel-foot">
            音级一列是相对 <b>{refKeyName}</b> 大调的关系（1 = 主音）。点任意一行可以试听。
          </p>
        </>
      )}

      <div className="legend">
        <span className="legend-item"><i className="dot dot-selected" />已选中的位置</span>
        <span className="legend-item"><i className="dot dot-tone" />指板上的普通音</span>
      </div>
    </Panel>
  )
}
