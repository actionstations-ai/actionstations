// Redlines (#431): proposed edits of the plans that failed in an exercise, reviewed one by one,
// then exported as tracked changes in the plan's own Word file or as a change memo. The
// imported plans are never changed here.
import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { REDLINE_STATUSES, REDLINE_STATUS_LABELS, type RedlineStatus } from '@shared/schemas'
import { Button, EmptyState, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { DiffLegend } from './DiffView'
import { ExportDialog } from './ExportDialog'
import { ManualDialog } from './ManualDialog'
import { ProposePanel } from './ProposePanel'
import { RedlineCard } from './RedlineCard'
import './redlines.css'

function Summary({ counts }: { counts: Partial<Record<RedlineStatus, number>> }) {
  const parts = REDLINE_STATUSES.filter((s) => counts[s]).map(
    (s) => `${REDLINE_STATUS_LABELS[s]} ${counts[s]}`,
  )
  return <p className="muted">{parts.length ? parts.join(' · ') : 'No proposals yet'}</p>
}

export default function RedlinesPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const [search] = useSearchParams()
  const [scenarioId, setScenarioId] = useState(search.get('scenario') ?? '')
  const [status, setStatus] = useState<RedlineStatus | ''>('')
  const [selected, setSelected] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [manual, setManual] = useState(!!search.get('excerpt'))
  const scenarios = useIpcQuery('scenarios:list', { projectPath })
  const redlines = useIpcQuery('redlines:list', { projectPath })
  const docs = useIpcQuery('documents:list', { projectPath })
  const all = useMemo(() => redlines.data ?? [], [redlines.data])
  const shown = all
    .filter((r) => !scenarioId || r.source.scenarioId === scenarioId)
    .filter((r) => !status || r.status === status)
  const counts = useMemo(() => {
    const out: Partial<Record<RedlineStatus, number>> = {}
    for (const r of all) out[r.status] = (out[r.status] ?? 0) + 1
    return out
  }, [all])
  const exportable = selected.filter((id) => all.find((r) => r.id === id)?.status === 'accepted')
  const replacing = (docs.data ?? []).filter((d) => d.supersedesDocumentId)
  const check = async () => {
    try {
      let n = 0
      for (const d of replacing) {
        n += (await call('redlines:check-applied', { projectPath, documentId: d.id })).length
      }
      toast.success(
        'Checked',
        `${n} ${n === 1 ? 'proposal' : 'proposals'} read against the new plans.`,
      )
    } catch (e) {
      toast.error('Could not check', errorText(e))
    }
  }
  return (
    <div className="page redlines-page">
      <PageHeader
        eyebrow="After the exercise"
        title="Redlines"
        description="Proposed wording for the plan sections an exercise showed did not work. Accept the ones you want, then export them for the plan's owner."
        actions={
          <>
            <Button onClick={() => setManual(true)}>
              <Plus size={16} aria-hidden /> Add by hand
            </Button>
            <Button
              variant="primary"
              disabled={!exportable.length}
              onClick={() => setExporting(true)}
            >
              Export accepted…
            </Button>
          </>
        }
      />
      {scenarioId && <ProposePanel projectPath={projectPath} scenarioId={scenarioId} />}
      <form
        className="redlines-filters"
        aria-label="Filter proposals"
        onSubmit={(e) => e.preventDefault()}
      >
        <Field label="Scenario">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={scenarioId}
              onChange={(e) => setScenarioId(e.target.value)}
            >
              <option value="">All scenarios</option>
              {(scenarios.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Status">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={status}
              onChange={(e) => setStatus(e.target.value as RedlineStatus | '')}
            >
              <option value="">All</option>
              {REDLINE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {REDLINE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </form>
      <div className="row redlines-bar">
        <Summary counts={counts} />
        {replacing.length > 0 && (
          <Button size="sm" onClick={() => void check()}>
            Check against updated plans
          </Button>
        )}
      </div>
      <DiffLegend />
      {redlines.isError && (
        <p className="field__error" role="alert">
          Could not load the proposals: {errorText(redlines.error)}
        </p>
      )}
      {!redlines.isPending && !shown.length && (
        <EmptyState
          title="No proposals"
          body={
            scenarioId
              ? 'Choose the findings above and draft proposals, or add one by hand.'
              : 'Open a scenario’s after-action report and choose "Propose plan redlines", or pick a scenario here.'
          }
        />
      )}
      <ul className="redline-list">
        {shown.map((r) => (
          <RedlineCard
            key={r.id}
            redline={r}
            projectPath={projectPath}
            selected={selected.includes(r.id)}
            onSelect={(on) => setSelected((s) => (on ? [...s, r.id] : s.filter((x) => x !== r.id)))}
          />
        ))}
      </ul>
      {exporting && (
        <ExportDialog
          projectPath={projectPath}
          ids={exportable}
          onClose={() => setExporting(false)}
        />
      )}
      {manual && (
        <ManualDialog
          projectPath={projectPath}
          scenarios={scenarios.data ?? []}
          scenarioId={scenarioId}
          {...(search.get('doc') ? { documentId: search.get('doc')! } : {})}
          {...(search.get('excerpt') ? { excerpt: search.get('excerpt')! } : {})}
          onClose={() => setManual(false)}
        />
      )}
    </div>
  )
}
