// /program/actions: every corrective action of the program as a real table with sortable
// column headers, filters, bulk changes, the editor drawer and the AAR/IP import entry.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { capabilityName, CORE_CAPABILITIES } from '@shared/core-capabilities'
import { isOverdue } from '@shared/program/status'
import {
  CORRECTIVE_ACTION_STATUSES,
  CORRECTIVE_ACTION_STATUS_LABELS,
  type CorrectiveActionStatus,
  type CorrectiveActionView,
} from '@shared/schemas'
import { actionLabel } from '@shared/program/status'
import { Badge, Button, Dialog, EmptyState, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import { refreshProgramQueries, useProgramUi } from '../../state/program'
import { ActionDrawer } from './ActionDrawer'
import { exportCsvNow, newAction } from './program-helpers'
import {
  countActions,
  ownerNames,
  sortActions,
  todayIso,
  type SortDir,
  type SortKey,
} from './action-table'
import { ExportDialog } from './ExportDialog'
import { ProgramFrame, type ProgramContext } from './ProgramFrame'
import { StatusDialog } from './StatusDialog'

const PAGE = 200

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'number', label: 'ID' },
  { key: 'title', label: 'Corrective action' },
  { key: 'capability', label: 'Capability' },
  { key: 'owner', label: 'Owner' },
  { key: 'due', label: 'Due' },
  { key: 'status', label: 'Status' },
]

function Filters({ ctx, all }: { ctx: ProgramContext; all: CorrectiveActionView[] }) {
  const { filters, setFilters, resetFilters } = useProgramUi()
  const owners = ownerNames(all)
  return (
    <form
      className="program-filters"
      aria-label="Filter corrective actions"
      onSubmit={(e) => e.preventDefault()}
    >
      <Field label="Status">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={filters.statuses.join(',')}
            onChange={(e) =>
              setFilters({
                statuses: e.target.value
                  ? (e.target.value.split(',') as CorrectiveActionStatus[])
                  : [],
              })
            }
          >
            <option value="">All statuses</option>
            <option value="open,in_progress">Open and in progress</option>
            {CORRECTIVE_ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CORRECTIVE_ACTION_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Capability">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={filters.capability}
            onChange={(e) => setFilters({ capability: e.target.value })}
          >
            <option value="">All</option>
            {CORE_CAPABILITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Owner">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={filters.ownerName}
            onChange={(e) => setFilters({ ownerName: e.target.value })}
          >
            <option value="">All</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Project">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={filters.projectId}
            onChange={(e) => setFilters({ projectId: e.target.value })}
          >
            <option value="">All</option>
            {ctx.summary.program.projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <label className="row program-filters__check">
        <input
          type="checkbox"
          checked={filters.overdueOnly}
          onChange={(e) => setFilters({ overdueOnly: e.target.checked })}
        />
        <span>Overdue only</span>
      </label>
      <Button size="sm" onClick={resetFilters}>
        Reset
      </Button>
    </form>
  )
}

function ImportPicker({ ctx, onClose }: { ctx: ProgramContext; onClose: () => void }) {
  const snaps = useIpcQuery('program:snapshots', { programPath: ctx.programPath })
  const navigate = useNavigate()
  const rows = (snaps.data ?? []).flatMap((s) =>
    s.scenarios.filter((sc) => sc.aarPresent).map((sc) => ({ project: s, scenario: sc })),
  )
  const go = async (projectId: string, scenarioId: string) => {
    const path = ctx.summary.projectPaths[projectId]
    if (!path) return toast.error('That project is not on this computer')
    try {
      await call('project:open', { path })
      navigate(`/program/import/${projectKey(path)}/${scenarioId}`)
    } catch (e) {
      toast.error('Could not open the project', e)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Import from an after-action report"
      description="Pick a scenario that has an after-action report and improvement plan draft. You review each corrective action before it is added."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {rows.length === 0 ? (
        <p>
          No linked project has a scenario with an after-action report yet. Draft one on the
          scenario's report page, then come back.
        </p>
      ) : (
        <ul className="stack">
          {rows.map(({ project, scenario }) => (
            <li key={scenario.scenarioId} className="row program-between">
              <span>
                <strong>{scenario.title}</strong>
                <br />
                <span className="muted">{project.name}</span>
              </span>
              <Button size="sm" onClick={() => void go(project.projectId, scenario.scenarioId)}>
                Review {scenario.title}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

function BulkDialog(props: { programPath: string; ids: string[]; onClose: () => void }) {
  const [ownerName, setOwnerName] = useState('')
  const [ownerOrganization, setOwnerOrganization] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')
  const save = async () => {
    const patch = {
      ...(ownerName.trim() ? { ownerName: ownerName.trim() } : {}),
      ...(ownerOrganization.trim() ? { ownerOrganization: ownerOrganization.trim() } : {}),
      ...(dueDate ? { dueDate } : {}),
    }
    if (!Object.keys(patch).length) return setError('Fill in at least one field to change.')
    try {
      await call('program:action-bulk', { programPath: props.programPath, ids: props.ids, patch })
      await refreshProgramQueries()
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      title={`Change ${props.ids.length} actions`}
      description="Only the fields you fill in are changed."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>
            Apply
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Owner">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Owner organization">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={ownerOrganization}
              onChange={(e) => setOwnerOrganization(e.target.value)}
            />
          )}
        </Field>
        <Field label="Due date">
          {({ id }) => (
            <input
              id={id}
              type="date"
              className="input"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          )}
        </Field>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

function Row(props: {
  view: CorrectiveActionView
  selected: boolean
  today: string
  onSelect: () => void
  onOpen: () => void
}) {
  const a = props.view.action
  const late = isOverdue(a, props.today)
  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={`Select ${actionLabel(a)}`}
          checked={props.selected}
          onChange={props.onSelect}
        />
      </td>
      <td>{actionLabel(a)}</td>
      <td>
        <button type="button" className="program-link" onClick={props.onOpen}>
          {a.title}
        </button>
      </td>
      <td>{a.coreCapabilities.map(capabilityName).join(', ')}</td>
      <td>
        {[a.owner.name, a.owner.organization && `(${a.owner.organization})`]
          .filter(Boolean)
          .join(' ')}
      </td>
      <td>
        {a.dueDate ?? ''}
        {late && <Badge tone="warn">Overdue</Badge>}
      </td>
      <td>{CORRECTIVE_ACTION_STATUS_LABELS[a.status]}</td>
    </tr>
  )
}

function ActionsTable(props: {
  ctx: ProgramContext
  views: CorrectiveActionView[]
  onOpen: (id: string) => void
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'number', dir: 'asc' })
  const [selected, setSelected] = useState<string[]>([])
  const [shown, setShown] = useState(PAGE)
  const [dialog, setDialog] = useState<'status' | 'bulk'>()
  const [announce, setAnnounce] = useState('')
  const today = todayIso()
  const sorted = useMemo(() => sortActions(props.views, sort.key, sort.dir), [props.views, sort])
  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  const ariaSort = (key: SortKey) =>
    sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  return (
    <>
      {selected.length > 0 && (
        <div className="row program-bulk" role="region" aria-label="Selected actions">
          <span>{selected.length} selected</span>
          <Button size="sm" onClick={() => setDialog('status')}>
            Change status…
          </Button>
          <Button size="sm" onClick={() => setDialog('bulk')}>
            Owner or due date…
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear selection
          </Button>
        </div>
      )}
      <span className="sr-only" role="status">
        {announce}
      </span>
      <table className="table program-table">
        <caption className="sr-only">
          Corrective actions, {props.views.length} shown. Column headers sort the table.
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <input
                type="checkbox"
                aria-label="Select all shown actions"
                checked={selected.length > 0 && selected.length === Math.min(shown, sorted.length)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? sorted.slice(0, shown).map((v) => v.action.id) : [],
                  )
                }
              />
            </th>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" aria-sort={ariaSort(c.key)}>
                <button type="button" className="program-sort" onClick={() => toggleSort(c.key)}>
                  {c.label}
                  <span aria-hidden>
                    {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, shown).map((v) => (
            <Row
              key={v.action.id}
              view={v}
              today={today}
              selected={selected.includes(v.action.id)}
              onSelect={() => toggle(v.action.id)}
              onOpen={() => props.onOpen(v.action.id)}
            />
          ))}
        </tbody>
      </table>
      {sorted.length > shown && (
        <Button onClick={() => setShown((n) => n + PAGE)}>
          Show more ({sorted.length - shown} left)
        </Button>
      )}
      {dialog === 'status' && (
        <StatusDialog
          programPath={props.ctx.programPath}
          ids={selected}
          onClose={(to) => {
            setDialog(undefined)
            if (to) {
              setAnnounce(
                `${selected.length} actions changed to ${CORRECTIVE_ACTION_STATUS_LABELS[to]}`,
              )
              setSelected([])
            }
          }}
        />
      )}
      {dialog === 'bulk' && (
        <BulkDialog
          programPath={props.ctx.programPath}
          ids={selected}
          onClose={() => {
            setDialog(undefined)
            setSelected([])
          }}
        />
      )}
    </>
  )
}

function ActionsBody({ ctx }: { ctx: ProgramContext }) {
  const { filters, setFilters } = useProgramUi()
  // The health dashboard links here with ?capability=<id> (#438): show every status for it.
  const [params] = useSearchParams()
  const linked = params.get('capability')
  useEffect(() => {
    if (linked) setFilters({ capability: linked, statuses: [] })
  }, [linked, setFilters])
  const navigate = useNavigate()
  const openId = useParams().id
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const filter = {
    ...(filters.statuses.length ? { statuses: filters.statuses } : {}),
    ...(filters.capability ? { capability: filters.capability } : {}),
    ...(filters.ownerName ? { ownerName: filters.ownerName } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.overdueOnly ? { overdueOnly: true } : {}),
  }
  const shown = useIpcQuery('program:actions-list', { programPath: ctx.programPath, filter })
  const all = useIpcQuery('program:actions-list', { programPath: ctx.programPath })
  const counts = all.data ? countActions(all.data.actions, todayIso()) : undefined
  const opened = openId ? all.data?.actions.find((v) => v.action.id === openId) : undefined
  return (
    <div className="stack">
      <div className="row program-toolbar">
        <Button variant="primary" onClick={() => setCreating(true)}>
          New
        </Button>
        <Button onClick={() => setImporting(true)}>Import from AAR/IP…</Button>
        <Button onClick={() => void exportCsvNow(ctx.programPath)}>CSV</Button>
        <Button onClick={() => setExporting(true)}>Export…</Button>
      </div>
      <Filters ctx={ctx} all={all.data?.actions ?? []} />
      {shown.isError && (
        <p className="field__error" role="alert">
          {errorText(shown.error)}
        </p>
      )}
      {shown.data && shown.data.problems.length > 0 && (
        <p className="field__error" role="alert">
          {shown.data.problems.length} file(s) could not be read and are not in the list:{' '}
          {shown.data.problems[0]}
        </p>
      )}
      {shown.data && shown.data.actions.length === 0 ? (
        <EmptyState
          title={
            counts?.total
              ? 'No corrective actions match these filters'
              : 'No corrective actions yet'
          }
          body={
            counts?.total
              ? 'Change or reset the filters to see the rest.'
              : 'Add one by hand, or import the improvement plan of a finished exercise.'
          }
        />
      ) : (
        shown.data && (
          <ActionsTable
            ctx={ctx}
            views={shown.data.actions}
            onOpen={(id) => navigate(`/program/actions/${id}`)}
          />
        )
      )}
      {creating && (
        <ActionDrawer
          programPath={ctx.programPath}
          isNew
          initial={{ action: newAction(ctx.summary.program.id), revision: undefined }}
          onClose={() => setCreating(false)}
        />
      )}
      {opened && (
        <ActionDrawer
          key={opened.revision}
          programPath={ctx.programPath}
          isNew={false}
          initial={opened}
          onClose={() => navigate('/program/actions')}
        />
      )}
      {importing && <ImportPicker ctx={ctx} onClose={() => setImporting(false)} />}
      {exporting && (
        <ExportDialog
          programPath={ctx.programPath}
          focus="ip"
          onClose={() => setExporting(false)}
        />
      )}
    </div>
  )
}

export default function ActionsPage() {
  return (
    <ProgramFrame
      title="Corrective actions"
      description="Owners, due dates and status for every corrective action, across exercises."
    >
      {(ctx) => <ActionsBody ctx={ctx} />}
    </ProgramFrame>
  )
}
