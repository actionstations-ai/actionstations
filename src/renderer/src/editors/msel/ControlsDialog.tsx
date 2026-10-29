// "Controls" for one MSEL row (#426, spec 0426 FR-11/FR-12): the framework controls the row
// exercises. Accepted controls are solid chips; suggestions (from the mapping rules, or from the
// model when the project allows it) are dashed chips to accept or dismiss; a picker adds any other
// control. Nothing is stored until Save, and the model never accepts anything for you.
import { useId, useState } from 'react'
import { Check, X } from 'lucide-react'
import { controlLabel } from '@shared/compliance/coverage'
import { leafControls, suggestControls } from '@shared/compliance/rules'
import type { MselRow } from '@shared/schemas/scenario'
import type { Framework } from '@shared/schemas/compliance'
import { Button, Dialog } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { useJob } from '../../routes/generate/use-job'
import './controls-dialog.css'

type Suggestion = NonNullable<MselRow['controlSuggestions']>[number]

export interface ControlsResult {
  controls: string[]
  controlSuggestions: Suggestion[]
}

interface Props {
  projectPath: string
  scenarioId: string
  row: MselRow | null
  threatFamily: Parameters<typeof suggestControls>[2]['threatFamily']
  onCancel: () => void
  onSave: (result: ControlsResult) => void
}

export function ControlsDialog(props: Props) {
  // Keyed by row so the chips start from that row each time the dialog opens.
  return props.row ? <OpenControlsDialog key={props.row.id} {...props} row={props.row} /> : null
}

/** Rules suggest only until the row's suggestions have been reviewed once (saved). */
function initialSuggestions(row: MselRow, frameworks: Framework[], t: Props['threatFamily']) {
  if (row.controlSuggestions) return row.controlSuggestions
  const have = new Set(row.controls ?? [])
  return frameworks
    .flatMap((f) => suggestControls(f, row, { threatFamily: t }))
    .filter((ref) => !have.has(ref))
    .map((ref) => ({ ref, by: 'rule' as const }))
}

function Chip(props: { label: string; kind: 'accepted' | 'suggested'; children: React.ReactNode }) {
  return (
    <li className={`controls-chip controls-chip--${props.kind}`}>
      <span>{props.label}</span>
      {props.kind === 'suggested' && <span className="sr-only"> (suggested)</span>}
      {props.children}
    </li>
  )
}

function Picker(props: {
  frameworks: Framework[]
  taken: Set<string>
  onAdd: (ref: string) => void
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const hits = props.frameworks
    .flatMap((f) =>
      leafControls(f).map((c) => ({ ref: `${f.id}:${c.id}`, text: `${c.id} ${c.title}` })),
    )
    .filter((c) => !props.taken.has(c.ref) && q && c.text.toLowerCase().includes(q))
    .slice(0, 12)
  return (
    <div className="controls-picker">
      <label htmlFor={id}>Add a control</label>
      <input
        id={id}
        className="input"
        type="search"
        value={query}
        placeholder="Search by id or title"
        onChange={(e) => setQuery(e.target.value)}
      />
      {hits.length > 0 && (
        <ul className="controls-picker__hits" aria-label="Matching controls">
          {hits.map((h) => (
            <li key={h.ref}>
              <Button size="sm" onClick={() => props.onAdd(h.ref)}>
                Add {h.text}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {q && hits.length === 0 && <p className="muted">No other control matches.</p>}
    </div>
  )
}

function ModelSuggest(props: {
  projectPath: string
  scenarioId: string
  rowId: string
  onSuggest: (refs: string[]) => void
}) {
  const info = useIpcQuery('compliance:model-info', { projectPath: props.projectPath })
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string>()
  const job = useJob(jobId, (e) => {
    setJobId(null)
    const result = e.result as { suggestions?: { rowId: string; ref: string }[] } | undefined
    if (e.status !== 'done') return setError(e.error ?? 'The model did not finish')
    props.onSuggest(
      (result?.suggestions ?? []).filter((s) => s.rowId === props.rowId).map((s) => s.ref),
    )
  })
  const start = async () => {
    setError(undefined)
    try {
      const r = await call('compliance:suggest-model', {
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        rowIds: [props.rowId],
      })
      setJobId(r.jobId)
    } catch (e) {
      setError(errorText(e))
    }
  }
  const label = info.data?.providerLabel ? ` with ${info.data.providerLabel}` : ''
  return (
    <div className="controls-model">
      <Button size="sm" disabled={!!jobId || !info.data} onClick={() => void start()}>
        Suggest controls{label}
      </Button>
      {info.data && <p className="muted">{info.data.reason}</p>}
      <span role="status" className="muted">
        {jobId && (job?.message || 'Asking the model…')}
      </span>
      {error && (
        <p role="alert" className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}

function OpenControlsDialog(props: Props & { row: MselRow }) {
  const { row } = props
  const list = useIpcQuery('compliance:list', { projectPath: props.projectPath })
  const all = (list.data?.frameworks ?? []).map((f) => f.framework)
  const enabled = (list.data?.frameworks ?? []).filter((f) => f.enabled).map((f) => f.framework)
  const [accepted, setAccepted] = useState<string[]>(row.controls ?? [])
  const [suggested, setSuggested] = useState<Suggestion[] | null>(row.controlSuggestions ?? null)
  const shown = suggested ?? (list.data ? initialSuggestions(row, enabled, props.threatFamily) : [])
  const open = shown.filter((s) => !accepted.includes(s.ref))
  const label = (ref: string) => controlLabel(ref, all)
  const accept = (ref: string) => {
    setSuggested(open.filter((s) => s.ref !== ref))
    setAccepted((a) => (a.includes(ref) ? a : [...a, ref]))
  }
  const dismiss = (ref: string) => setSuggested(open.filter((s) => s.ref !== ref))
  const addModel = (refs: string[]) =>
    setSuggested([
      ...open,
      ...refs
        .filter((r) => !accepted.includes(r) && !open.some((s) => s.ref === r))
        .map((ref) => ({ ref, by: 'model' as const })),
    ])
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onCancel()}
      title={`Controls exercised by ${row.id}`}
      description="Accepted controls count as planned coverage. Suggestions are only suggestions until you accept them."
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!list.data}
            onClick={() => props.onSave({ controls: accepted, controlSuggestions: open })}
          >
            Save
          </Button>
        </>
      }
    >
      {list.isLoading && <p className="muted">Loading frameworks…</p>}
      {list.error && (
        <p className="field__error" role="alert">
          Could not load the frameworks: {errorText(list.error)}
        </p>
      )}
      {list.data && enabled.length === 0 && accepted.length === 0 && (
        <p className="muted">Switch on a control framework in the project settings first.</p>
      )}
      <h3 className="controls-heading">Accepted</h3>
      {accepted.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="controls-chips" aria-label="Accepted controls">
          {accepted.map((ref) => (
            <Chip key={ref} label={label(ref)} kind="accepted">
              <button
                type="button"
                className="controls-chip__btn"
                aria-label={`Remove ${label(ref)}`}
                onClick={() => setAccepted(accepted.filter((r) => r !== ref))}
              >
                <X size={12} aria-hidden />
              </button>
            </Chip>
          ))}
        </ul>
      )}
      <h3 className="controls-heading">Suggested</h3>
      {open.length === 0 ? (
        <p className="muted">No suggestions.</p>
      ) : (
        <ul className="controls-chips" aria-label="Suggested controls">
          {open.map((s) => (
            <Chip key={s.ref} label={label(s.ref)} kind="suggested">
              <button
                type="button"
                className="controls-chip__btn"
                aria-label={`Accept ${label(s.ref)}`}
                onClick={() => accept(s.ref)}
              >
                <Check size={12} aria-hidden />
              </button>
              <button
                type="button"
                className="controls-chip__btn"
                aria-label={`Dismiss ${label(s.ref)}`}
                onClick={() => dismiss(s.ref)}
              >
                <X size={12} aria-hidden />
              </button>
            </Chip>
          ))}
        </ul>
      )}
      <Picker
        frameworks={enabled}
        taken={new Set(accepted)}
        onAdd={(ref) => setAccepted((a) => [...a, ref])}
      />
      {list.data?.modelMapping && (
        <ModelSuggest
          projectPath={props.projectPath}
          scenarioId={props.scenarioId}
          rowId={row.id}
          onSuggest={addModel}
        />
      )}
    </Dialog>
  )
}
