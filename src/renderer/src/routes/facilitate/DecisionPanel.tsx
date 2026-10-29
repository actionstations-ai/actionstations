// Decisions tab (spec 0430 FR-5, FR-6): close the open branch decision by its rule, by the
// controller's choice or by timeout, override a closed one before its branch starts, and check
// that the recorded run replays. The option always comes from the rule or a person.
import { useEffect, useId, useRef, useState } from 'react'
import { votesCast } from '@shared/branching/decide'
import type { DecisionTallyInput, DecisionTallySource } from '@shared/branching/input'
import { ruleText } from '../../editors/msel/branch-ops'
import type {
  BranchingLogInput,
  BranchingReplayResult,
  FacilitatorState,
} from '@shared/ipc/facilitator'
import type { Decision, Scenario } from '@shared/schemas/scenario'
import { Badge, Button } from '../../components/ui'
import { call } from '../../lib/api'
import {
  branchRowDelivered,
  buildRecord,
  closeEntry,
  decisionsOf,
  minutesLeft,
  pathFor,
  withRecord,
} from './branching'
import { exerciseStamp } from './clock'
import { ProposeInject } from './ProposeInjectCard'
import type { UpdateState } from './use-delivery-actions'

interface Props {
  projectPath: string
  scenario: Scenario
  state: FacilitatorState
  update: UpdateState
  minutes: number
  /** Votes from players' devices, when voting is available (spec 0414). */
  tallySource?: DecisionTallySource
  onLog: (entries: BranchingLogInput[]) => void
  onAnnounce: (text: string) => void
}

type Close = (a: {
  decision: Decision
  by: 'vote' | 'controller' | 'timeout' | 'override'
  input: DecisionTallyInput
  choice?: string
  note?: string
}) => void

function useClose(p: Props): Close {
  const { update, onLog, onAnnounce, minutes } = p
  return (a) => {
    const record = buildRecord({
      ...a,
      now: new Date(),
      exerciseTime: exerciseStamp(minutes),
      ...(a.by === 'override' ? { supersedes: a.decision.id } : {}),
    })
    update((s) => withRecord(s, record, crypto.randomUUID()))
    onLog([closeEntry(record)])
    const label = a.decision.options.find((o) => o.id === record.optionId)?.label ?? record.optionId
    onAnnounce(`Decision "${a.decision.question}": ${label}, by ${record.by}`)
  }
}

function TallyEditor(props: {
  decision: Decision
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
  readOnly: boolean
}) {
  const id = useId()
  return (
    <fieldset className="fac-decision__tally" disabled={props.readOnly}>
      <legend>Votes (show of hands)</legend>
      {props.decision.options.map((o) => (
        <label key={o.id} htmlFor={`${id}-${o.id}`}>
          {o.label}
          <input
            id={`${id}-${o.id}`}
            className="input fac-decision__num"
            type="number"
            min={0}
            value={props.value[o.id] ?? 0}
            onChange={(e) =>
              props.onChange({
                ...props.value,
                [o.id]: Math.max(0, Math.floor(Number(e.target.value))),
              })
            }
          />
        </label>
      ))}
    </fieldset>
  )
}

/** Puts the decision on the presentation screen; it follows the decision once it is taken. */
function ShowOnScreen(props: { projectPath: string; scenarioId: string; decisionId: string }) {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() =>
        void call('facilitator:present-decision', {
          projectPath: props.projectPath,
          scenarioId: props.scenarioId,
          decisionId: props.decisionId,
        })
      }
    >
      Show on screen
    </Button>
  )
}

function OpenDecision(props: Props & { decision: Decision; rowId: string; close: Close }) {
  const { decision, state } = props
  const [hand, setHand] = useState<Record<string, number>>({})
  const live = props.tallySource?.(decision.id)
  const input: DecisionTallyInput = live ?? { decisionId: decision.id, tally: hand }
  const cast = votesCast(decision, input.tally)
  const delivered = state.delivered[props.rowId]
  const left = minutesLeft(decision, delivered?.exerciseTime, props.minutes)
  const rule = decision.rule.kind
  const canRule = rule === 'controller' || cast > 0
  const timedOut = useRef<string | undefined>(undefined)
  const { close } = props
  useEffect(() => {
    if (left === undefined || left > 0 || timedOut.current === decision.id) return
    timedOut.current = decision.id
    close({ decision, by: 'timeout', input })
  })
  const option = (id: string) => decision.options.find((o) => o.id === id)
  return (
    <section className="fac-decision" aria-label="Open decision">
      <h3>{decision.question}</h3>
      <p className="muted">
        Rule: {ruleText(decision.rule)}. If it cannot decide, the default is{' '}
        <strong>{option(decision.defaultOptionId)?.label}</strong>.
        {left !== undefined && (
          <>
            {' '}
            <span role="timer">{left > 0 ? `${Math.ceil(left)} min left` : 'Time is up'}</span>
          </>
        )}
      </p>
      {!delivered && (
        <p role="status">Deliver row {props.rowId} to open this decision to the room.</p>
      )}
      <TallyEditor decision={decision} value={input.tally} onChange={setHand} readOnly={!!live} />
      <p className="muted">
        {cast} {cast === 1 ? 'vote' : 'votes'} counted
        {input.eligible !== undefined ? ` of ${input.eligible}` : ''}.
      </p>
      <div className="fac-decision__buttons">
        <Button
          variant="primary"
          disabled={!canRule}
          onClick={() => close({ decision, by: 'vote', input })}
        >
          Decide by rule
        </Button>
        {decision.options.map((o) => (
          <Button
            key={o.id}
            onClick={() => close({ decision, by: 'controller', input, choice: o.id })}
          >
            Controller chooses: {o.label}
          </Button>
        ))}
        <ShowOnScreen
          projectPath={props.projectPath}
          scenarioId={props.scenario.id}
          decisionId={decision.id}
        />
      </div>
      {rule !== 'controller' && cast === 0 && (
        <p className="muted">Enter a tally to decide by rule, or choose an option yourself.</p>
      )}
    </section>
  )
}

function ClosedList(props: Props & { close: Close }) {
  const { scenario, state } = props
  const [note, setNote] = useState('')
  const [target, setTarget] = useState('')
  const [open, setOpen] = useState<string | undefined>()
  const noteId = useId()
  const rows = new Map(scenario.msel.flatMap((r) => (r.decision ? [[r.decision.id, r]] : [])))
  const latest = new Map(decisionsOf(state).map((r) => [r.decisionId, r]))
  return (
    <ul className="fac-decision__closed" aria-label="Decisions taken">
      {[...latest.values()].map((rec) => {
        const decision = rows.get(rec.decisionId)?.decision
        if (!decision) return null
        const chosen = decision.options.find((o) => o.id === rec.optionId)?.label ?? rec.optionId
        const canOverride = !branchRowDelivered(scenario, decision, rec.optionId, state.delivered)
        return (
          <li key={rec.decisionId}>
            <strong>{decision.question}</strong> <Badge tone="info">{chosen}</Badge>{' '}
            <span className="muted">
              by {rec.by === 'vote' ? ruleText(rec.rule) : rec.by} at {rec.exerciseTime}
              {rec.input.cast > 0 ? `, ${rec.input.cast} votes` : ''}
              {rec.note ? `. Note: ${rec.note}` : ''}
            </span>
            <ShowOnScreen
              projectPath={props.projectPath}
              scenarioId={scenario.id}
              decisionId={rec.decisionId}
            />
            {canOverride && open !== rec.decisionId && (
              <Button size="sm" variant="ghost" onClick={() => setOpen(rec.decisionId)}>
                Override…
              </Button>
            )}
            {canOverride && open === rec.decisionId && (
              <div className="fac-decision__override">
                <label htmlFor={`${noteId}-opt`}>Change to</label>
                <select
                  id={`${noteId}-opt`}
                  className="select"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="">Choose an option</option>
                  {decision.options
                    .filter((o) => o.id !== rec.optionId)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                </select>
                <label htmlFor={`${noteId}-note`}>Why (required)</label>
                <input
                  id={`${noteId}-note`}
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!target || !note.trim()}
                  onClick={() => {
                    props.close({
                      decision,
                      by: 'override',
                      input: { decisionId: decision.id, tally: rec.input.tally },
                      choice: target,
                      note: note.trim(),
                    })
                    setOpen(undefined)
                    setNote('')
                    setTarget('')
                  }}
                >
                  Override decision
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(undefined)}>
                  Cancel
                </Button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ReplayCheck(props: { projectPath: string; scenarioId: string }) {
  const [result, setResult] = useState<BranchingReplayResult>()
  const [busy, setBusy] = useState(false)
  const run = () => {
    setBusy(true)
    call('facilitator:branching-replay', {
      projectPath: props.projectPath,
      scenarioId: props.scenarioId,
    })
      .then(setResult)
      .catch((e: Error) => setResult({ status: 'mismatch', message: e.message }))
      .finally(() => setBusy(false))
  }
  return (
    <div className="fac-decision__replay">
      <Button size="sm" disabled={busy} onClick={run}>
        Replay check
      </Button>
      {result && (
        <p role="status" className={result.status === 'matches' ? undefined : 'field__error'}>
          {result.message}
        </p>
      )}
    </div>
  )
}

export function DecisionPanel(props: Props) {
  const { scenario, state } = props
  const close = useClose(props)
  const path = pathFor(scenario, state)
  const open = path?.openDecision
  const openRow = open && scenario.msel.find((r) => r.decision?.id === open.id)
  const taken = decisionsOf(state).length
  return (
    <div className="fac-decisions">
      {open && openRow ? (
        <OpenDecision {...props} decision={open} rowId={openRow.id} close={close} />
      ) : (
        <p className="muted">
          {taken
            ? 'No decision is waiting.'
            : 'Decisions appear here as the exercise reaches them.'}
        </p>
      )}
      <ClosedList {...props} close={close} />
      <ProposeInject {...props} path={path} />
      <ReplayCheck projectPath={props.projectPath} scenarioId={scenario.id} />
    </div>
  )
}
