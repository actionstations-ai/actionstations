// /program/import/:projectKey/:scenarioId: review the corrective actions an after-action report
// proposes before they enter the program (FR-6). Items already imported are marked; an item whose
// report text changed since is offered as an update, never added a second time.
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { capabilityName } from '@shared/core-capabilities'
import type { AarImportPreview } from '@shared/ipc'
import { Badge, Button, EmptyState } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { refreshProgramQueries } from '../../state/program'
import { ProgramFrame, type ProgramContext } from './ProgramFrame'

type Item = AarImportPreview[number]
interface Edit {
  include: boolean
  title: string
  owner: string
  dueDate: string
}

const STATE_TEXT: Record<Item['state'], string> = {
  new: 'New',
  imported: 'Already imported',
  changed: 'Changed since import',
}

const initialEdit = (i: Item): Edit => ({
  include: i.state !== 'imported',
  title: i.proposed.title ?? '',
  owner: i.proposed.owner?.name ?? '',
  dueDate: i.proposed.dueDate ?? '',
})

function ItemCard(props: { item: Item; edit: Edit; onChange: (e: Edit) => void }) {
  const { item, edit } = props
  const id = `imp-${item.aarItemId.replace(/[^A-Za-z0-9]/g, '')}`
  const existing = item.state !== 'new'
  return (
    <li className="card stack">
      <div className="row program-between">
        <label className="row" htmlFor={`${id}-inc`}>
          <input
            id={`${id}-inc`}
            type="checkbox"
            checked={edit.include}
            onChange={(e) => props.onChange({ ...edit, include: e.target.checked })}
          />
          <strong>
            {item.proposed.coreCapabilities?.map(capabilityName).join(', ') || 'Corrective action'}
          </strong>
        </label>
        <Badge tone={item.state === 'new' ? 'info' : item.state === 'changed' ? 'warn' : 'neutral'}>
          {STATE_TEXT[item.state]}
        </Badge>
      </div>
      <p className="muted">{item.areaForImprovement.split('\n')[0]}</p>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-title`}>
          Corrective action
        </label>
        <input
          id={`${id}-title`}
          className="input"
          value={edit.title}
          disabled={existing}
          onChange={(e) => props.onChange({ ...edit, title: e.target.value })}
        />
      </div>
      <div className="row program-form-row">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-owner`}>
            Owner
          </label>
          <input
            id={`${id}-owner`}
            className="input"
            value={edit.owner}
            disabled={existing}
            onChange={(e) => props.onChange({ ...edit, owner: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${id}-due`}>
            Due date
          </label>
          <input
            id={`${id}-due`}
            type="date"
            className="input"
            value={edit.dueDate}
            disabled={existing}
            onChange={(e) => props.onChange({ ...edit, dueDate: e.target.value })}
          />
        </div>
      </div>
      {item.proposed.planSections && item.proposed.planSections.length > 0 && (
        <p className="muted">
          Plan sections:{' '}
          {item.proposed.planSections.map((s) => s.headingPath || s.documentTitle).join('; ')}
        </p>
      )}
      {item.state === 'changed' && edit.include && (
        <p className="muted">
          Importing updates the title, description, capability and plan sections. Status, owner and
          due date you set in the program stay as they are.
        </p>
      )}
    </li>
  )
}

function Review(props: { ctx: ProgramContext; projectPath: string; scenarioId: string }) {
  const navigate = useNavigate()
  const preview = useIpcQuery('program:import-aar-preview', {
    programPath: props.ctx.programPath,
    projectPath: props.projectPath,
    scenarioId: props.scenarioId,
  })
  const [edits, setEdits] = useState<Record<string, Edit>>({})
  const [busy, setBusy] = useState(false)
  if (preview.isError)
    return (
      <EmptyState
        title="This report cannot be imported"
        body={errorText(preview.error)}
        actions={
          <Link className="btn" to="/program/actions">
            Back to corrective actions
          </Link>
        }
      />
    )
  const items = preview.data ?? []
  const editOf = (i: Item): Edit => edits[i.aarItemId] ?? initialEdit(i)
  const chosen = items.filter((i) => editOf(i).include)
  const submit = async () => {
    setBusy(true)
    try {
      const record = await call('program:import-aar', {
        programPath: props.ctx.programPath,
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        items: items.map((i) => {
          const e = editOf(i)
          const base = i.proposed
          return {
            aarItemId: i.aarItemId,
            include: e.include,
            overrides:
              i.state === 'new'
                ? {
                    title: e.title.trim() || base.title || 'Corrective action',
                    owner: {
                      name: e.owner,
                      organization: base.owner?.organization ?? '',
                      email: '',
                    },
                    ...(e.dueDate ? { dueDate: e.dueDate } : {}),
                  }
                : {},
          }
        }),
      })
      await refreshProgramQueries()
      const made = record.items.filter((r) => r.action === 'created').length
      const updated = record.items.filter((r) => r.action === 'updated').length
      toast.success('Import finished', `${made} added, ${updated} updated.`)
      navigate('/program/actions')
    } catch (e) {
      toast.error('Could not import', e)
    } finally {
      setBusy(false)
    }
  }
  if (!preview.data) return <p role="status">Reading the report…</p>
  if (!items.length)
    return (
      <EmptyState
        title="The report has no corrective actions"
        body="Add corrective actions to the areas for improvement on the report page, then import again."
      />
    )
  return (
    <div className="stack">
      <ul className="stack program-import">
        {items.map((i) => (
          <ItemCard
            key={i.aarItemId}
            item={i}
            edit={editOf(i)}
            onChange={(e) => setEdits((cur) => ({ ...cur, [i.aarItemId]: e }))}
          />
        ))}
      </ul>
      <div className="row">
        <Button
          variant="primary"
          disabled={busy || chosen.length === 0}
          onClick={() => void submit()}
        >
          {busy
            ? 'Importing…'
            : `Import ${chosen.length} ${chosen.length === 1 ? 'action' : 'actions'}`}
        </Button>
        <Link className="btn" to="/program/actions">
          Cancel
        </Link>
      </div>
    </div>
  )
}

export default function ImportAarPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  return (
    <ProgramFrame
      title="Import from an after-action report"
      description="Tick the corrective actions to add to the program, and fix wording, owner or due date before they go in."
    >
      {(ctx) => <Review ctx={ctx} projectPath={projectPath} scenarioId={scenarioId} />}
    </ProgramFrame>
  )
}
