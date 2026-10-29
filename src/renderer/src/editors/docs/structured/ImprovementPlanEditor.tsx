// Appendix A of the AAR/IP as an editable table (#419, FR-4, FR-6): one row per corrective
// action with the fields HSEEP asks for. The model proposes the action, its capability element
// and an owner role; a person types the organization, the point of contact and the dates, and
// locks the rows that must survive a re-draft. Also the exercise date, the participating
// organizations (Appendix B) and the acronyms (Appendix D).
import { Plus, X } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { capabilityName } from '@shared/core-capabilities'
import {
  CAPABILITY_ELEMENT_LABELS,
  CAPABILITY_ELEMENTS,
  improvementPlanRows,
  type Aar,
  type CorrectiveAction,
  type Finding,
} from '@shared/schemas/aar'
import type { Scenario } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { newItemId } from '../owners'
import { StringList, TextField } from './inputs'

export interface ImprovementPlanEditorProps {
  aar: Aar
  scenario: Scenario
  onChange: (fn: (a: Aar) => Aar) => void
}

const STATUS_LABELS: Record<CorrectiveAction['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
}

function roleLabel(s: Scenario, roleId: string | undefined): string {
  if (!roleId) return ''
  const r = s.roles.find((x) => x.id === roleId)
  return r ? r.abbreviation || r.name : roleId
}

/** Apply a change to one corrective action, found by finding and action id. */
function updateAction(
  aar: Aar,
  findingId: string,
  actionId: string,
  fn: (a: CorrectiveAction) => CorrectiveAction,
): Aar {
  return mapFindings(aar, (f) =>
    f.id !== findingId
      ? f
      : {
          ...f,
          correctiveActions: f.correctiveActions.map((a) => (a.id === actionId ? fn(a) : a)),
        },
  )
}

function mapFindings(aar: Aar, fn: (f: Finding) => Finding): Aar {
  return {
    ...aar,
    capabilities: aar.capabilities.map((c) => ({
      ...c,
      areasForImprovement: c.areasForImprovement.map(fn),
    })),
  }
}

const blankAction = (): CorrectiveAction => ({
  id: newItemId('ca'),
  action: '',
  element: 'planning',
  ownerOrganization: '',
  poc: '',
  status: 'open',
  locked: true,
})

function Cell(props: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <td>
      <label className="sr-only" htmlFor={id}>
        {props.label}
      </label>
      {props.children(id)}
    </td>
  )
}

function ActionRow(props: {
  row: ReturnType<typeof improvementPlanRows>[number]
  n: number
  scenario: Scenario
  onChange: (fn: (a: CorrectiveAction) => CorrectiveAction) => void
  onRemove: () => void
}) {
  const { row, n } = props
  const a = row.action
  const where = `row ${n}`
  const text = (field: 'action' | 'ownerOrganization' | 'poc') => (value: string) =>
    props.onChange((x) => ({ ...x, [field]: value }))
  const date = (field: 'startDate' | 'dueDate') => (value: string) =>
    props.onChange((x) => {
      const next = { ...x }
      if (value) next[field] = value
      else delete next[field]
      return next
    })
  return (
    <tr>
      <th scope="row">{capabilityName(row.capability)}</th>
      <td>{row.finding.title}</td>
      <Cell label={`Corrective action, ${where}`}>
        {(id) => (
          <textarea
            id={id}
            className="textarea"
            rows={2}
            value={a.action}
            onChange={(e) => text('action')(e.target.value)}
          />
        )}
      </Cell>
      <Cell label={`Capability element, ${where}`}>
        {(id) => (
          <select
            id={id}
            className="select"
            value={a.element}
            onChange={(e) =>
              props.onChange((x) => ({
                ...x,
                element: e.target.value as CorrectiveAction['element'],
              }))
            }
          >
            {CAPABILITY_ELEMENTS.map((el) => (
              <option key={el} value={el}>
                {CAPABILITY_ELEMENT_LABELS[el]}
              </option>
            ))}
          </select>
        )}
      </Cell>
      <Cell label={`Primary responsible organization, ${where}`}>
        {(id) => (
          <input
            id={id}
            className="input"
            value={a.ownerOrganization}
            placeholder={a.ownerRole ? `Proposed: ${roleLabel(props.scenario, a.ownerRole)}` : ''}
            onChange={(e) => text('ownerOrganization')(e.target.value)}
          />
        )}
      </Cell>
      <Cell label={`Organization point of contact, ${where}`}>
        {(id) => (
          <input
            id={id}
            className="input"
            value={a.poc}
            onChange={(e) => text('poc')(e.target.value)}
          />
        )}
      </Cell>
      <Cell label={`Start date, ${where}`}>
        {(id) => (
          <input
            id={id}
            type="date"
            className="input"
            value={a.startDate ?? ''}
            onChange={(e) => date('startDate')(e.target.value)}
          />
        )}
      </Cell>
      <Cell label={`Completion date, ${where}`}>
        {(id) => (
          <input
            id={id}
            type="date"
            className="input"
            value={a.dueDate ?? ''}
            onChange={(e) => date('dueDate')(e.target.value)}
          />
        )}
      </Cell>
      <Cell label={`Status, ${where}`}>
        {(id) => (
          <select
            id={id}
            className="select"
            value={a.status}
            onChange={(e) =>
              props.onChange((x) => ({
                ...x,
                status: e.target.value as CorrectiveAction['status'],
              }))
            }
          >
            {(Object.keys(STATUS_LABELS) as CorrectiveAction['status'][]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        )}
      </Cell>
      <Cell label={`Keep on re-draft, ${where}`}>
        {(id) => (
          <input
            id={id}
            type="checkbox"
            checked={a.locked}
            onChange={(e) => props.onChange((x) => ({ ...x, locked: e.target.checked }))}
          />
        )}
      </Cell>
      <td>
        <Button
          size="sm"
          icon
          variant="ghost"
          aria-label={`Remove corrective action ${n}`}
          onClick={props.onRemove}
        >
          <X size={14} aria-hidden />
        </Button>
      </td>
    </tr>
  )
}

function AddActionRow(props: ImprovementPlanEditorProps) {
  const id = useId()
  const findings = props.aar.capabilities.flatMap((c) =>
    c.areasForImprovement.map((f) => ({ capability: c.capability, f })),
  )
  if (!findings.length) return null
  return (
    <div className="row aar-ip__add">
      <label className="field__label" htmlFor={id}>
        Add a corrective action to
      </label>
      <select
        id={id}
        className="select"
        defaultValue=""
        onChange={(e) => {
          const findingId = e.target.value
          if (!findingId) return
          props.onChange((a) =>
            mapFindings(a, (f) =>
              f.id === findingId
                ? { ...f, correctiveActions: [...f.correctiveActions, blankAction()] }
                : f,
            ),
          )
          e.target.value = ''
        }}
      >
        <option value="">Choose an area for improvement…</option>
        {findings.map(({ capability, f }) => (
          <option key={f.id} value={f.id}>
            {capabilityName(capability)}: {f.title}
          </option>
        ))}
      </select>
      <Plus size={14} aria-hidden />
    </div>
  )
}

function AcronymsEditor(props: ImprovementPlanEditorProps) {
  const { acronyms } = props.aar
  const set = (next: Aar['acronyms']) => props.onChange((a) => ({ ...a, acronyms: next }))
  return (
    <fieldset className="string-list aar-acronyms">
      <legend className="field__label">Acronyms (Appendix D, on top of the HSEEP terms)</legend>
      {acronyms.map((ac, i) => (
        <div key={i} className="aar-acronyms__row">
          <TextField
            label={`Acronym ${i + 1}`}
            hideLabel
            value={ac.term}
            onChange={(term) => set(acronyms.map((x, j) => (j === i ? { ...x, term } : x)))}
          />
          <TextField
            label={`Meaning ${i + 1}`}
            hideLabel
            value={ac.meaning}
            onChange={(meaning) => set(acronyms.map((x, j) => (j === i ? { ...x, meaning } : x)))}
          />
          <Button
            size="sm"
            icon
            variant="ghost"
            aria-label={`Remove acronym ${ac.term || i + 1}`}
            onClick={() => set(acronyms.filter((_, j) => j !== i))}
          >
            <X size={14} aria-hidden />
          </Button>
        </div>
      ))}
      <Button size="sm" onClick={() => set([...acronyms, { term: '', meaning: '' }])}>
        <Plus size={14} aria-hidden /> Add acronym
      </Button>
    </fieldset>
  )
}

export function ImprovementPlanEditor(props: ImprovementPlanEditorProps) {
  const dateId = useId()
  const rows = improvementPlanRows(props.aar)
  return (
    <section className="aar-ip" aria-labelledby="aar-ip-title">
      <header className="part__head">
        <h2 id="aar-ip-title" className="section-title">
          Improvement Plan
        </h2>
      </header>
      <p className="muted part__hint">
        One row per corrective action. The draft proposes the action, the capability element and a
        role; type the organization, the contact and the dates. Rows marked Keep survive a re-draft.
      </p>
      <div className="table-scroll">
        <table className="table aar-ip__table">
          <caption className="sr-only">Improvement Plan: corrective actions</caption>
          <thead>
            <tr>
              <th scope="col">Core Capability</th>
              <th scope="col">Issue / Area for Improvement</th>
              <th scope="col">Corrective Action</th>
              <th scope="col">Capability Element</th>
              <th scope="col">Primary Responsible Organization</th>
              <th scope="col">Organization POC</th>
              <th scope="col">Start Date</th>
              <th scope="col">Completion Date</th>
              <th scope="col">Status</th>
              <th scope="col">Keep</th>
              <th scope="col">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <ActionRow
                key={row.action.id}
                row={row}
                n={i + 1}
                scenario={props.scenario}
                onChange={(fn) =>
                  props.onChange((a) => updateAction(a, row.finding.id, row.action.id, fn))
                }
                onRemove={() =>
                  props.onChange((a) =>
                    mapFindings(a, (f) =>
                      f.id !== row.finding.id
                        ? f
                        : {
                            ...f,
                            correctiveActions: f.correctiveActions.filter(
                              (x) => x.id !== row.action.id,
                            ),
                          },
                    ),
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="muted">No corrective actions yet.</p>}
      <AddActionRow {...props} />
      <div className="aar-ip__meta">
        <div className="field">
          <label className="field__label" htmlFor={dateId}>
            Exercise date
          </label>
          <input
            id={dateId}
            type="date"
            className="input"
            value={props.aar.exerciseDate ?? ''}
            onChange={(e) =>
              props.onChange((a) => {
                const next = { ...a }
                if (e.target.value) next.exerciseDate = e.target.value
                else delete next.exerciseDate
                return next
              })
            }
          />
        </div>
        <StringList
          label="Participating organizations (Appendix B; organizations only, never people)"
          itemLabel="Organization"
          items={props.aar.participatingOrganizations}
          onChange={(items) => props.onChange((a) => ({ ...a, participatingOrganizations: items }))}
        />
        <AcronymsEditor {...props} />
      </div>
    </section>
  )
}
