import { useMemo } from 'react'
import { identifyChord, intervalToDegree, parseChordSymbol, spellRoot, chordsByCategory, type ChordDef } from '../theory/chords'
import { KEY_CHOICES, defaultSpell, pc as toPc } from '../theory/notes'
import { noteAt, stringLabel, type Tuning } from '../theory/tunings'
import { classicShapeFor, voicingToTabText, type Voicing } from '../theory/voicings'
import { Chip, Field, Panel, Segmented, Select, Switch } from './Controls'
import { MiniFretboard } from './MiniFretboard'

/** 复用 BoardCard 里的定义，保证全项目只有一份 ChordCell / ChordSubMode */
export type { ChordCell, ChordSubMode } from './BoardCard'
import type { ChordCell, ChordSubMode } from './BoardCard'

export interface ChordPanelProps {
  tuning: Tuning
  preferFlat: boolean
  sub: ChordSubMode
  onChangeSub: (s: ChordSubMode) => void

  // ── 识别 ──
  selected: ChordCell[]
  onClearSelection: () => void
  onRemoveNote: (cell: ChordCell) => void
  onPlayNote: (midi: number) => void
  onJumpToLibrary: (rootPc: number, chordId: string) => void

  // ── 和弦库 ──
  libraryRootPc: number
  libraryRootLetterIdx: number
  libraryChordId: string
  onChangeLibraryRoot: (pc: number, letterIdx: number) => void
  onChangeLibraryChord: (id: string) => void
  voicings: Voicing[]
  voicingIndex: number
  onSelectVoicing: (i: number) => void
  onPlayVoicing: (v: Voicing) => void
  opts: { requireRootInBass: boolean; allowOpen: boolean; maxSpan: number; minSounding: number }
  onChangeOpts: (patch: Partial<ChordPanelProps['opts']>) => void
  /** 主指板上是否铺一层「全指板和弦音分布」底图 */
  showToneMap: boolean
  onToggleToneMap: (v: boolean) => void
  parseInput: string
  onChangeParseInput: (s: string) => void
}

export function ChordPanel(props: ChordPanelProps) {
  const { tuning, preferFlat, sub, onChangeSub } = props

  return (
    <Panel
      title="和弦模式"
      subtitle="点出音来识别，或者反过来查一个和弦怎么按"
      actions={
        <Segmented
          value={sub}
          onChange={onChangeSub}
          options={[
            { value: 'identify', label: '识别' },
            { value: 'library', label: '查按法' },
          ]}
        />
      }
    >
      {sub === 'identify' ? <IdentifySection {...props} tuning={tuning} preferFlat={preferFlat} /> : <LibrarySection {...props} tuning={tuning} preferFlat={preferFlat} />}
    </Panel>
  )
}

// ═══════════════════════════════════════════════════════════
// 识别
// ═══════════════════════════════════════════════════════════

function IdentifySection({
  tuning,
  preferFlat,
  selected,
  onClearSelection,
  onRemoveNote,
  onPlayNote,
  onJumpToLibrary,
}: ChordPanelProps) {
  const played = useMemo(
    () =>
      selected.map((c) => ({
        pc: toPc(noteAt(tuning, c.stringIdx, c.fret)),
        midi: noteAt(tuning, c.stringIdx, c.fret),
        stringIdx: c.stringIdx,
        fret: c.fret,
      })),
    [selected, tuning],
  )

  const result = useMemo(() => identifyChord(played, { preferFlat }), [played, preferFlat])
  const best = result.candidates[0]

  return (
    <>
      {selected.length === 0 && (
        <p className="empty-hint">
          在上方指板上点击，把你按的和弦一个音一个音点出来（至少 3 个音）。系统会自动排序给出最可能的和弦名。
        </p>
      )}

      {selected.length > 0 && (
        <>
          <div className="picked-notes">
            {played.map((p) => (
              <button
                key={`${p.stringIdx}-${p.fret}`}
                type="button"
                className="picked-note"
                onClick={() => onRemoveNote({ stringIdx: p.stringIdx, fret: p.fret })}
                onDoubleClick={() => onPlayNote(p.midi)}
                title="单击移除，双击试听"
              >
                <b>{defaultSpell(p.pc, preferFlat)}</b>
                <em>
                  {stringLabel(tuning, p.stringIdx)}弦{p.fret === 0 ? '空' : p.fret}
                </em>
                {best && <i>{intervalToDegree((p.pc - best.rootPc + 12) % 12, best.def.intervals)}</i>}
              </button>
            ))}
            <Chip onClick={onClearSelection}>清空</Chip>
          </div>

          {best ? (
            <>
              <div className="chord-hero">
                <span className="chord-hero-symbol">{best.fullSymbol}</span>
                <span className="chord-hero-zh">
                  {best.rootName} {best.nameZh}
                  {best.inversion !== null && best.inversion > 0 && ` · 第 ${best.inversion} 转位`}
                  {best.bassPc !== null && !best.bassIsRoot && ` · 低音 ${best.bassName}`}
                </span>
              </div>

              <ul className="cand-list">
                {result.candidates.map((c, i) => (
                  <li key={`${c.rootPc}-${c.suffix}-${i}`} className={`cand${i === 0 ? ' is-best' : ''}`}>
                    <span className="cand-symbol">{c.fullSymbol}</span>
                    <span className="cand-zh">{c.def.nameZh}</span>
                    <span className="cand-badges">
                      {c.perfect && <i className="badge badge-ok">完美匹配</i>}
                      {c.missing.length > 0 && (
                        <i className="badge badge-warn" title={`缺 ${c.missing.map((m) => intervalToDegree(m, c.def.intervals)).join(' ')}`}>
                          省 {c.missing.map((m) => intervalToDegree(m, c.def.intervals)).join(' ')}
                        </i>
                      )}
                      {c.extra.length > 0 && (
                        <i className="badge badge-warn" title={`多出 ${c.extra.map((m) => intervalToDegree(m, c.def.intervals)).join(' ')}`}>
                          加 {c.extra.map((m) => intervalToDegree(m, c.def.intervals)).join(' ')}
                        </i>
                      )}
                    </span>
                    <span className="cand-bar" aria-hidden>
                      <i style={{ width: `${Math.max(8, Math.min(100, ((c.score - 40) / 1.6)))}%` }} />
                    </span>
                    <button type="button" className="cand-go" onClick={() => onJumpToLibrary(c.rootPc, c.def.id)} title="看这个和弦怎么按">
                      查按法 →
                    </button>
                  </li>
                ))}
              </ul>
              <p className="panel-foot">
                同一堆音常常有多个合理读法（比如 C6 和 Am7），排序会把<b>低音</b>作为主要依据。
              </p>
            </>
          ) : (
            <p className="empty-hint warn">{result.fallbackDesc}</p>
          )}
        </>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════
// 和弦库 / 查按法
// ═══════════════════════════════════════════════════════════

function LibrarySection({
  tuning,
  preferFlat,
  libraryRootPc,
  libraryChordId,
  onChangeLibraryRoot,
  onChangeLibraryChord,
  voicings,
  voicingIndex,
  onSelectVoicing,
  onPlayVoicing,
  opts,
  onChangeOpts,
  showToneMap,
  onToggleToneMap,
  parseInput,
  onChangeParseInput,
}: ChordPanelProps) {
  const groups = chordsByCategory()
  const chordOptions = groups.flatMap((g) =>
    g.chords.map((c) => ({ value: c.id, label: `${c.suffix || '（大三）'} · ${c.nameZh}`, group: g.label })),
  )

  const parsed = parseChordSymbol(parseInput)
  const current = voicings[voicingIndex] ?? voicings[0]
  const rootName = spellRoot(libraryRootPc, preferFlat)
  const shown = voicings.slice(0, 24)

  return (
    <>
      <div className="grid-2">
        <Field label="根音">
          <Select
            value={libraryRootPc}
            onChange={(v) => {
              const k = KEY_CHOICES.find((x) => x.pc === v)!
              onChangeLibraryRoot(k.pc, k.letterIdx)
            }}
            options={KEY_CHOICES.map((k) => ({ value: k.pc, label: k.name }))}
            ariaLabel="和弦根音"
          />
        </Field>
        <Field label="和弦类型">
          <Select value={libraryChordId} onChange={onChangeLibraryChord} options={chordOptions} ariaLabel="和弦类型" />
        </Field>
      </div>

      <Field label="或者直接输入和弦名" hint="支持 Cmaj7 / F#m7b5 / Bb7#9 / A-7 / Cø">
        <input
          className={`text-input${parseInput.length > 0 && !parsed ? ' is-invalid' : ''}`}
          value={parseInput}
          placeholder="例如 Bbmaj7"
          onChange={(e) => onChangeParseInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && parsed) {
              onChangeLibraryRoot(parsed.rootPc, 'CDEFGAB'.indexOf(parsed.rootName[0].toUpperCase()))
              onChangeLibraryChord(parsed.def.id)
            }
          }}
        />
      </Field>
      {parseInput.length > 0 && !parsed && <p className="empty-hint warn">没认出这个和弦名，检查一下拼写。</p>}
      {parseInput.length > 0 && parsed && (
        <p className="panel-foot">
          解析为 <b>{parsed.symbol}</b>
          {parsed.def.category && `（${parsed.def.nameZh}）`}，按回车跳到这个和弦。
        </p>
      )}

      <div className="switch-row">
        <Switch
          checked={showToneMap}
          onChange={onToggleToneMap}
          label="显示全指板和弦音"
          title="在指板上把所有属于这个和弦的位置都淡淡标出来，看清和弦音怎么铺满整个指板"
        />
      </div>

      <details className="opts">
        <summary>筛选条件</summary>
        <div className="switch-row">
          <Switch
            checked={opts.requireRootInBass}
            onChange={(v) => onChangeOpts({ requireRootInBass: v })}
            label="低音必须是根音"
            title="打开只出原位和弦；关掉就会包含转位（比如 C/G）"
          />
          <Switch checked={opts.allowOpen} onChange={(v) => onChangeOpts({ allowOpen: v })} label="允许空弦" />
        </div>
        <div className="grid-2">
          <Field label={`最大跨度 ${opts.maxSpan} 品`} hint="手指能张多开">
            <input type="range" min={2} max={6} value={opts.maxSpan} onChange={(e) => onChangeOpts({ maxSpan: Number(e.target.value) })} className="range" />
          </Field>
          <Field label={`最少发声弦数 ${opts.minSounding}`}>
            <input type="range" min={3} max={tuning.strings.length} value={opts.minSounding} onChange={(e) => onChangeOpts({ minSounding: Number(e.target.value) })} className="range" />
          </Field>
        </div>
      </details>

      <div className="lib-head">
        <h3>
          {rootName}
          {chordNameSuffix(libraryChordId)} 的按法
        </h3>
        <span className="lib-count">{voicings.length} 种</span>
      </div>

      {voicings.length === 0 ? (
        <p className="empty-hint warn">
          在当前筛选条件下找不到可弹的指型。试试放宽「最大跨度」或关掉「低音必须是根音」。
        </p>
      ) : (
        <div className="voicing-grid">
          {shown.map((v, i) => {
            const tab = voicingToTabText(v)
            const classic = classicShapeFor(libraryChordId, libraryRootPc, tuning.id)
            const isClassic = classic !== null && classic.join(',') === v.frets.join(',')
            return (
              <button
                key={`${tab}-${i}`}
                type="button"
                className={`voicing-card${i === voicingIndex ? ' is-active' : ''}`}
                onClick={() => onSelectVoicing(i)}
                onDoubleClick={() => onPlayVoicing(v)}
                title="单击在主指板上显示，双击试听"
              >
                <MiniFretboard tuning={tuning} frets={v.frets} degrees={v.degrees} />
                <span className="voicing-tab">{tab}</span>
                <span className="voicing-tags">
                  <i>{v.position === 1 && v.minFret === 0 ? '开放' : `${v.position} 品`}</i>
                  {v.inversion !== null && v.inversion > 0 && <i>转位 {v.inversion}</i>}
                  {isClassic && <i className="tag-classic">经典</i>}
                  {v.muted > 0 && <i>{v.muted} 弦不弹</i>}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {current && (
        <div className="voicing-detail">
          <div>
            <span className="vd-label">当前指型</span>
            <code className="vd-tab">{voicingToTabText(current)}</code>
          </div>
          <div className="vd-tones">
            {current.degrees.map((d, s) =>
              d === null ? null : (
                <span key={s} className={`vd-tone${d === '1' ? ' is-root' : ''}`}>
                  {d}
                </span>
              ),
            )}
          </div>
          <Chip onClick={() => onPlayVoicing(current)} title="按这个指型扫弦">▶ 试听</Chip>
        </div>
      )}
    </>
  )
}

function chordNameSuffix(id: string): string {
  const def: ChordDef | undefined = chordsByCategory()
    .flatMap((g) => g.chords)
    .find((c) => c.id === id)
  return def ? def.suffix : ''
}
