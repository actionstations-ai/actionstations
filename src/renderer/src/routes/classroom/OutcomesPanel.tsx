// Learning outcomes and their mapping to exercise objectives (#720, FR-2). Proposals are word
// overlap and stay suggestions until the instructor adds them.
import { useState } from 'react'
import type { ClassroomState, MappingSuggestionView } from '@shared/ipc/classroom'
import { BLOOM_LEVELS } from '@shared/schemas'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { downloadText } from './download'
import { call, change } from './use-classroom'

type Draft = { id?: string; code: string; text: string; bloom?: string; programOutcome?: string }

function OutcomeRows(props: { rows: Draft[]; onChange: (rows: Draft[]) => void }) {
  const { rows, onChange } = props
  const edit = (i: number, patch: Partial<Draft>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <ul className="classroom-list" aria-label="Learning outcomes">
      {rows.map((r, i) => (
        <li key={r.id ?? `new-${i}`} className="classroom-outcome">
          <input
            className="input"
            aria-label={`Outcome ${i + 1} code`}
            value={r.code}
            onChange={(e) => edit(i, { code: e.target.value })}
          />
          <input
            className="input"
            aria-label={`Outcome ${i + 1} text`}
            value={r.text}
            onChange={(e) => edit(i, { text: e.target.value })}
          />
          <select
            className="input"
            aria-label={`Outcome ${i + 1} Bloom level`}
            value={r.bloom ?? ''}
            onChange={(e) => edit(i, { bloom: e.target.value || undefined })}
          >
            <option value="">No level</option>
            {BLOOM_LEVELS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <input
            className="input"
            aria-label={`Outcome ${i + 1} program outcome`}
            placeholder="Program outcome"
            value={r.programOutcome ?? ''}
            onChange={(e) => edit(i, { programOutcome: e.target.value || undefined })}
          />
          <Button
            size="sm"
            aria-label={`Remove outcome ${r.code || i + 1}`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  )
}

function Mapping(props: { projectPath: string; state: ClassroomState }) {
  const { projectPath, state } = props
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const [chosen, setChosen] = useState('')
  const scenarioId = chosen || scenarios.data?.[0]?.id || ''
  const [found, setFound] = useState<MappingSuggestionView[]>([])
  const mapped = state.course.mappings.filter((m) => m.scenarioId === scenarioId)
  const code = (id: string) => state.course.outcomes.find((o) => o.id === id)?.code ?? id
  const suggest = async () => {
    try {
      setFound(await call('classroom:suggest-mappings', { projectPath, scenarioId }))
    } catch (e) {
      toast.error('Could not suggest mappings', errorText(e))
    }
  }
  const save = (next: typeof mapped) =>
    change('Could not save the mapping', () =>
      call('classroom:set-mappings', { projectPath, scenarioId, mappings: next }),
    )
  const accept = (s: MappingSuggestionView) => {
    setFound(found.filter((f) => f !== s))
    return save([
      ...mapped,
      { outcomeId: s.outcomeId, kind: 'objective', ref: s.objectiveId, confirmed: true },
    ])
  }
  if (state.course.outcomes.length === 0 || scenarios.data?.length === 0) return null
  return (
    <div className="stack">
      <h3 className="section-title">Map objectives to outcomes</h3>
      <Field label="Scenario">
        {({ id }) => (
          <select
            id={id}
            className="input"
            value={scenarioId}
            onChange={(e) => setChosen(e.target.value)}
          >
            {(scenarios.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <ul className="classroom-list" aria-label="Confirmed mappings">
        {mapped.map((m) => (
          <li key={`${m.outcomeId}-${m.ref}`} className="row">
            {code(m.outcomeId)} ← objective {m.ref}
            <Button size="sm" onClick={() => void save(mapped.filter((x) => x !== m))}>
              Remove
            </Button>
          </li>
        ))}
        {mapped.length === 0 && <li className="muted">No mappings confirmed yet.</li>}
      </ul>
      <div className="row">
        <Button onClick={() => void suggest()}>Suggest mappings</Button>
      </div>
      {found.length > 0 && (
        <ul className="classroom-list" aria-label="Suggested mappings">
          {found.map((s) => (
            <li key={`${s.outcomeId}-${s.objectiveId}`} className="row">
              {code(s.outcomeId)} and “{s.objectiveName}” share: {s.shared.join(', ')}
              <Button size="sm" onClick={() => void accept(s)}>
                Confirm
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function OutcomesPanel(props: { projectPath: string; state: ClassroomState }) {
  const { projectPath, state } = props
  const [rows, setRows] = useState<Draft[]>(state.course.outcomes.map((o) => ({ ...o })))
  const save = () =>
    change('Could not save the outcomes', () =>
      call('classroom:set-outcomes', {
        projectPath,
        outcomes: rows.filter((r) => r.code.trim() && r.text.trim()) as never,
      }),
    )
  const exportJson = async () => {
    const file = await call('classroom:export-outcomes', { projectPath })
    downloadText(file.fileName, file.json)
  }
  const importJson = async (file: File | undefined) => {
    if (!file) return
    const ok = await change('Could not import the outcomes', async () =>
      call('classroom:import-outcomes', { projectPath, json: await file.text(), mode: 'add' }),
    )
    if (ok) toast.success('Outcomes added')
  }
  return (
    <section className="card stack" aria-labelledby="classroom-outcomes-title">
      <h2 id="classroom-outcomes-title" className="section-title">
        Learning outcomes
      </h2>
      <OutcomeRows rows={rows} onChange={setRows} />
      <div className="row">
        <Button onClick={() => setRows([...rows, { code: '', text: '' }])}>Add an outcome</Button>
        <Button variant="primary" onClick={() => void save()}>
          Save outcomes
        </Button>
        <Button onClick={() => void exportJson()}>Export as JSON</Button>
      </div>
      <Field label="Import an outcome set (JSON)">
        {({ id }) => (
          <input
            id={id}
            type="file"
            accept=".json,application/json"
            onChange={(e) => void importJson(e.target.files?.[0])}
          />
        )}
      </Field>
      <Mapping projectPath={projectPath} state={state} />
    </section>
  )
}
