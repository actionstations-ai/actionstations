// 3-Up / 3-Down capture and the decision log of the hot wash panel (#419, FR-3): what went
// well, what to improve and what was decided, tagged with an objective and an inject, saved in
// facilitator.json so an exercise without live play still produces evidence for the AAR/IP.
// Items name roles, never people.
import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import type {
  FacilitatorDecision,
  FacilitatorHotwashItem,
  FacilitatorState,
} from '@shared/ipc/facilitator'
import {
  HOTWASH_ITEM_KIND_LABELS,
  HOTWASH_ITEM_KINDS,
  type HotwashItemKind,
} from '@shared/schemas/aar'
import { DEVICE_HOTWASH_PREFIX } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { Button } from '../../components/ui'
import { newItemId } from '../../editors/docs/owners'
import { roleLabelOf } from './capture-utils'
import type { UpdateState } from './use-delivery-actions'

export interface CaptureProps {
  scenario: Scenario
  state: FacilitatorState
  update: UpdateState
  /** The exercise clock ("H:MM"), recorded with each decision. */
  exerciseTime: string
}

function RowSelect(props: {
  id: string
  label: string
  value: string
  rows: Scenario['msel']
  onChange: (rowId: string) => void
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={props.id}>
        {props.label}
      </label>
      <select
        id={props.id}
        className="select"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">No inject</option>
        {props.rows.map((r) => (
          <option key={r.id} value={r.id}>
            {r.id} · {r.time}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Add one hot wash item: kind, text, optional objective and inject. */
function AddHotwashItem(props: CaptureProps) {
  const ids = useId()
  const [kind, setKind] = useState<HotwashItemKind>('strength')
  const [text, setText] = useState('')
  const [objectiveRef, setObjectiveRef] = useState('')
  const [rowId, setRowId] = useState('')
  const add = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const item: FacilitatorHotwashItem = {
      id: newItemId('hw'),
      kind,
      text: trimmed,
      ...(objectiveRef ? { objectiveRef } : {}),
      ...(rowId ? { rowId } : {}),
      at: new Date().toISOString(),
    }
    props.update((s) => ({ ...s, hotwash: [...s.hotwash, item] }))
    setText('')
  }
  return (
    <form
      className="fac-capture"
      aria-label="Add a hot wash item"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <fieldset className="fac-rating">
        <legend className="sr-only">Kind of item</legend>
        {HOTWASH_ITEM_KINDS.map((k) => (
          <label key={k} className="fac-rating__option">
            <input
              type="radio"
              name={`${ids}-kind`}
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            {HOTWASH_ITEM_KIND_LABELS[k]}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label className="field__label" htmlFor={`${ids}-text`}>
          Hot wash item
        </label>
        <textarea
          id={`${ids}-text`}
          className="textarea"
          rows={2}
          value={text}
          placeholder="What the room said went well or needs work; procedures, not people"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="fac-capture__row">
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-objective`}>
            Objective
          </label>
          <select
            id={`${ids}-objective`}
            className="select"
            value={objectiveRef}
            onChange={(e) => setObjectiveRef(e.target.value)}
          >
            <option value="">No objective</option>
            {props.scenario.objectives.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name || o.text}
              </option>
            ))}
          </select>
        </div>
        <RowSelect
          id={`${ids}-row`}
          label="Inject"
          value={rowId}
          rows={props.scenario.msel}
          onChange={setRowId}
        />
      </div>
      <Button size="sm" type="submit" disabled={!text.trim()}>
        <Plus size={14} aria-hidden /> Add item
      </Button>
    </form>
  )
}

function HotwashItemRow(props: {
  item: FacilitatorHotwashItem
  scenario: Scenario
  update: UpdateState
}) {
  const { item } = props
  const objective = props.scenario.objectives.find((o) => o.id === item.objectiveRef)
  const tags = [objective?.name || objective?.text, item.rowId].filter(Boolean).join(' · ')
  return (
    <li className="fac-capture__item">
      <div className="field">
        <label className="field__label sr-only" htmlFor={`hw-${item.id}`}>
          Hot wash item text
        </label>
        <textarea
          id={`hw-${item.id}`}
          className="textarea"
          rows={2}
          value={item.text}
          onChange={(e) =>
            props.update(
              (s) => ({
                ...s,
                hotwash: s.hotwash.map((h) =>
                  h.id === item.id ? { ...h, text: e.target.value } : h,
                ),
              }),
              { debounce: true },
            )
          }
        />
      </div>
      <div className="fac-capture__meta">
        {tags && <span className="muted">{tags}</span>}
        <Button
          size="sm"
          icon
          variant="ghost"
          aria-label={`Remove hot wash item ${item.text.slice(0, 40)}`}
          onClick={() =>
            props.update((s) => ({ ...s, hotwash: s.hotwash.filter((h) => h.id !== item.id) }))
          }
        >
          <X size={14} aria-hidden />
        </Button>
      </div>
    </li>
  )
}

/** The 3-Up / 3-Down list grouped by kind, with the add form. */
export function HotwashCapture(props: CaptureProps) {
  return (
    <section aria-labelledby="fac-hw-capture" className="fac-hotwash__capture">
      <h2 id="fac-hw-capture">3-Up / 3-Down</h2>
      <p className="muted">
        What the room says went well and what needs work, as evidence for the after-action report.
        Write about procedures and plans, not people.
      </p>
      {HOTWASH_ITEM_KINDS.map((kind) => {
        const items = props.state.hotwash.filter(
          (h) => h.kind === kind && !h.id.startsWith(DEVICE_HOTWASH_PREFIX),
        )
        return (
          <section key={kind} aria-label={HOTWASH_ITEM_KIND_LABELS[kind]}>
            <h3>
              {HOTWASH_ITEM_KIND_LABELS[kind]} <span className="muted">({items.length})</span>
            </h3>
            {items.length ? (
              <ul className="fac-capture__list">
                {items.map((item) => (
                  <HotwashItemRow
                    key={item.id}
                    item={item}
                    scenario={props.scenario}
                    update={props.update}
                  />
                ))}
              </ul>
            ) : (
              <p className="muted fac-hotwash__empty">Nothing captured yet.</p>
            )}
          </section>
        )
      })}
      <AddHotwashItem {...props} />
    </section>
  )
}

/** Items promoted from the hot wash board on devices (#415), editable like the ones above. */
export function DeviceHotwash(props: CaptureProps) {
  const items = props.state.hotwash.filter((h) => h.id.startsWith(DEVICE_HOTWASH_PREFIX))
  return (
    <section aria-labelledby="fac-hw-devices" className="fac-hotwash__capture">
      <h2 id="fac-hw-devices">From devices</h2>
      {items.length ? (
        <>
          <p className="muted">
            Promoted from what players and evaluators posted. They go into the report with the items
            above.
          </p>
          {HOTWASH_ITEM_KINDS.map((kind) => {
            const ofKind = items.filter((h) => h.kind === kind)
            if (!ofKind.length) return null
            return (
              <section key={kind} aria-label={`From devices: ${HOTWASH_ITEM_KIND_LABELS[kind]}`}>
                <h3>{HOTWASH_ITEM_KIND_LABELS[kind]}</h3>
                <ul className="fac-capture__list">
                  {ofKind.map((item) => (
                    <HotwashItemRow
                      key={item.id}
                      item={item}
                      scenario={props.scenario}
                      update={props.update}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </>
      ) : (
        <p className="muted fac-hotwash__empty">
          Nothing promoted from devices yet. Promote items on the Hot wash board tab.
        </p>
      )}
    </section>
  )
}

/** One logged decision with its time, inject and deciding role. */
export function DecisionRow(props: {
  decision: FacilitatorDecision
  scenario: Scenario
  update: UpdateState
}) {
  const { decision: d } = props
  const meta = [d.exerciseTime, d.rowId, roleLabelOf(props.scenario, d.byRole)]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="fac-capture__item">
      <p className="fac-capture__text">{d.text}</p>
      <div className="fac-capture__meta">
        <span className="muted mono">{meta}</span>
        <Button
          size="sm"
          icon
          variant="ghost"
          aria-label={`Remove decision ${d.text.slice(0, 40)}`}
          onClick={() =>
            props.update((s) => ({ ...s, decisions: s.decisions.filter((x) => x.id !== d.id) }))
          }
        >
          <X size={14} aria-hidden />
        </Button>
      </div>
    </li>
  )
}

/** Log one decision: text, deciding role, exercise time; `rowId` ties it to an inject. */
export function LogDecisionForm(props: CaptureProps & { rowId?: string }) {
  const ids = useId()
  const [text, setText] = useState('')
  const [byRole, setByRole] = useState('')
  const [time, setTime] = useState(props.exerciseTime)
  const [seenTime, setSeenTime] = useState(props.exerciseTime)
  // Follow the clock until the facilitator types a time.
  if (seenTime !== props.exerciseTime) {
    setSeenTime(props.exerciseTime)
    if (time === seenTime) setTime(props.exerciseTime)
  }
  const log = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    const decision: FacilitatorDecision = {
      id: newItemId('dec'),
      at: new Date().toISOString(),
      ...(/^\d{1,2}:[0-5]\d$/.test(time.trim()) ? { exerciseTime: time.trim() } : {}),
      ...(props.rowId ? { rowId: props.rowId } : {}),
      text: trimmed,
      ...(byRole ? { byRole } : {}),
    }
    props.update((s) => ({ ...s, decisions: [...s.decisions, decision] }))
    setText('')
  }
  return (
    <form
      className="fac-capture"
      aria-label={props.rowId ? `Log a decision on ${props.rowId}` : 'Log a decision'}
      onSubmit={(e) => {
        e.preventDefault()
        log()
      }}
    >
      <div className="field">
        <label className="field__label" htmlFor={`${ids}-text`}>
          Decision{props.rowId ? ` on ${props.rowId}` : ''}
        </label>
        <textarea
          id={`${ids}-text`}
          className="textarea"
          rows={2}
          value={text}
          placeholder="What was decided, in the room's words"
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="fac-capture__row">
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-role`}>
            Decided by
          </label>
          <select
            id={`${ids}-role`}
            className="select"
            value={byRole}
            onChange={(e) => setByRole(e.target.value)}
          >
            <option value="">Role not recorded</option>
            {props.scenario.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.abbreviation ? ` (${r.abbreviation})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-time`}>
            Exercise time (H:MM)
          </label>
          <input
            id={`${ids}-time`}
            className="input"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <Button size="sm" type="submit" disabled={!text.trim()}>
        <Plus size={14} aria-hidden /> Log decision
      </Button>
    </form>
  )
}

/** The decision log of the hot wash panel: every decision, oldest first, plus the form. */
export function DecisionLog(props: CaptureProps) {
  return (
    <section aria-labelledby="fac-hw-decisions">
      <h2 id="fac-hw-decisions">Decision log</h2>
      {props.state.decisions.length ? (
        <ul className="fac-capture__list">
          {props.state.decisions.map((d) => (
            <DecisionRow key={d.id} decision={d} scenario={props.scenario} update={props.update} />
          ))}
        </ul>
      ) : (
        <p className="muted">
          No decisions logged yet. Log them here or from the inject panel of the row they answer.
        </p>
      )}
      <LogDecisionForm {...props} />
    </section>
  )
}
