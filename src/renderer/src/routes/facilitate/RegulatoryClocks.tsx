// The regulatory clocks strip under the exercise clock (#426, spec 0426 FR-7). Each running clock
// shows its filing, the scenario-time deadline, the time left and a status in words and an icon
// (never colour alone). Status changes are announced politely; the countdown is not.
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { FacilitatorState } from '@shared/ipc'
import { CLOCK_STATUS_LABEL, type ClockStatus, type ClockView } from '@shared/compliance/clock'
import {
  exerciseMinOf,
  formatScenarioDate,
  formatSpan,
  scenarioAt,
  type ScenarioStart,
} from '@shared/compliance/scenario-time'
import {
  CLOCK_REF_PREFIX,
  NOT_LEGAL_ADVICE,
  regulationLabel,
  sessionOf,
  type Regulation,
} from '@shared/schemas/compliance'
import { Button } from '../../components/ui'
import { STATUS_ICON } from './clock-icons'
import {
  clearCompletion,
  completeClock,
  fireTrigger,
  parseScenarioInput,
  regulationClocks,
  statusChanges,
  toggleOnScreen,
  type RegulationClocks as Group,
} from './compliance'
import type { UpdateState } from './use-delivery-actions'

export interface RegulatoryClocksProps {
  regulations: readonly Regulation[]
  state: FacilitatorState
  update: UpdateState
  /** Exercise minutes now. */
  minutes: number
  start: ScenarioStart
}

const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`

function waitingText(reg: Regulation, view: ClockView): string {
  const names = view.waitingFor.map((ref) =>
    ref.startsWith(CLOCK_REF_PREFIX)
      ? `"${reg.clocks.find((c) => `${CLOCK_REF_PREFIX}${c.id}` === ref)?.label ?? ref}" to be filed`
      : `"${reg.triggers.find((t) => t.id === ref)?.label ?? ref}"`,
  )
  return `waiting for ${names.join(' or ')}`
}

function timeText(view: ClockView): string {
  if (view.minutesLeft === undefined) return ''
  return view.minutesLeft >= 0
    ? `${formatSpan(view.minutesLeft)} left`
    : `${formatSpan(-view.minutesLeft)} over`
}

function StatusLabel({ status }: { status: ClockStatus }) {
  const Icon = STATUS_ICON[status]
  return (
    <span className={`fac-rclock__status fac-rclock__status--${status}`}>
      <Icon size={14} aria-hidden /> {CLOCK_STATUS_LABEL[status]}
    </span>
  )
}

interface RowProps {
  group: Group
  view: ClockView
  props: RegulatoryClocksProps
}

/** "Filed at…", missed, waive (note required), undo. */
function ClockActions({ group, view, props }: RowProps) {
  const { update, start, minutes } = props
  const [mode, setMode] = useState<'filed' | 'waive' | undefined>()
  const [text, setText] = useState('')
  const [error, setError] = useState<string>()
  const now = scenarioAt(start.at, minutes)
  const id = `rc-${view.key.replace(/[^a-z0-9_]/gi, '-')}`
  const name = `${regulationLabel(group.regulation)} ${view.label}`
  if (view.completion)
    return (
      <Button size="sm" onClick={() => update((s) => clearCompletion(s, view.key))}>
        Undo {CLOCK_STATUS_LABEL[view.status].toLowerCase()}
        <span className="sr-only"> for {name}</span>
      </Button>
    )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (mode === 'waive') {
      if (!text.trim()) return setError('Say why the clock is waived')
      update((s) => completeClock(s, view.key, { status: 'waived', note: text.trim() }, start.at))
    } else {
      const at = text.trim() ? parseScenarioInput(text, now) : now
      if (!at) return setError('Use HH:MM, or YYYY-MM-DD HH:MM')
      const min = exerciseMinOf(start.at, at)
      update((s) => completeClock(s, view.key, { status: 'met', exerciseMin: min }, start.at))
    }
    setMode(undefined)
    setText('')
    setError(undefined)
  }
  if (mode)
    return (
      <form
        className="fac-rclock__form"
        onSubmit={submit}
        aria-label={`${mode === 'waive' ? 'Waive' : 'Filed'}: ${name}`}
      >
        <label htmlFor={`${id}-in`}>
          {mode === 'waive' ? 'Reason' : 'Filed at (scenario time)'}
        </label>
        <input
          id={`${id}-in`}
          className="input"
          value={text}
          placeholder={mode === 'waive' ? 'Not in scope for this exercise' : hhmm(now)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <Button type="submit" size="sm" variant="primary">
          {mode === 'waive' ? 'Waive' : 'Mark filed'}
        </Button>
        <Button size="sm" onClick={() => setMode(undefined)}>
          Cancel
        </Button>
        {error && (
          <span id={`${id}-err`} className="field__error" role="alert">
            {error}
          </span>
        )}
      </form>
    )
  return (
    <div className="fac-rclock__actions" role="group" aria-label={`Actions for ${name}`}>
      <Button size="sm" onClick={() => setMode('filed')} disabled={view.status === 'waiting'}>
        Filed…
      </Button>
      <Button
        size="sm"
        onClick={() => update((s) => completeClock(s, view.key, { status: 'missed' }, start.at))}
        disabled={view.status === 'waiting'}
      >
        Missed
      </Button>
      <Button size="sm" onClick={() => setMode('waive')}>
        Waive…
      </Button>
    </div>
  )
}

function ClockRow({ group, view, props }: RowProps) {
  const reg = group.regulation
  const onScreen = sessionOf(props.state).onScreen.includes(view.key)
  const due = view.dueAt ? formatScenarioDate(view.dueAt) : undefined
  return (
    <li className={`fac-rclock fac-rclock--${view.status}`} data-testid={`clock-${view.key}`}>
      <div className="fac-rclock__head">
        <strong>{regulationLabel(reg)}</strong>
        <span>
          {' · '}
          {view.label}
          {view.recipient && <> → {view.recipient}</>}
        </span>
      </div>
      <div className="fac-rclock__line">
        <StatusLabel status={view.status} />
        {view.status === 'waiting' ? (
          <span className="muted">{waitingText(reg, view)}</span>
        ) : (
          <span>
            {due && <>Due {due}</>}
            {timeText(view) && <> · {timeText(view)}</>}
            {view.completion?.atDate && <> · filed {formatScenarioDate(view.completion.atDate)}</>}
            {view.completion?.note && <> · {view.completion.note}</>}
          </span>
        )}
      </div>
      <div className="fac-rclock__line">
        <ClockActions group={group} view={view} props={props} />
        <label className="fac-rclock__screen">
          <input
            type="checkbox"
            checked={onScreen}
            onChange={() => props.update((s) => toggleOnScreen(s, view.key))}
          />{' '}
          Show on screen
          <span className="sr-only">
            : {regulationLabel(reg)} {view.label}
          </span>
        </label>
      </div>
    </li>
  )
}

/** Fire a regulation's trigger by hand ("Players determined materiality at 10:40"). */
function FireTrigger(props: RegulatoryClocksProps) {
  const options = props.regulations.flatMap((r) =>
    r.triggers.map((t) => ({
      value: `${r.id}:${t.id}`,
      label: `${regulationLabel(r)} › ${t.label}`,
    })),
  )
  const [choice, setChoice] = useState('')
  const [at, setAt] = useState('')
  const [error, setError] = useState<string>()
  const value = choice || options[0]?.value || ''
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const [regulationId, triggerId] = value.split(':') as [string, string]
    const now = scenarioAt(props.start.at, props.minutes)
    const when = at.trim() ? parseScenarioInput(at, now) : now
    if (!when) return setError('Use HH:MM, or YYYY-MM-DD HH:MM')
    const exerciseMin = exerciseMinOf(props.start.at, when)
    props.update((s) =>
      fireTrigger(s, { regulationId, triggerId, exerciseMin, by: 'manual' }, props.start.at),
    )
    setAt('')
    setError(undefined)
  }
  if (!options.length) return null
  return (
    <form className="fac-rclocks__fire" onSubmit={submit} aria-label="Fire a trigger">
      <label htmlFor="rc-trigger">Trigger</label>
      <select
        id="rc-trigger"
        className="input"
        value={value}
        onChange={(e) => setChoice(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label htmlFor="rc-at">At (scenario time, blank = now)</label>
      <input
        id="rc-at"
        className="input fac-rclocks__at"
        value={at}
        placeholder="HH:MM"
        aria-invalid={!!error}
        aria-describedby={error ? 'rc-at-err' : undefined}
        onChange={(e) => setAt(e.target.value)}
      />
      <Button type="submit" size="sm">
        Fire trigger
      </Button>
      {error && (
        <span id="rc-at-err" className="field__error" role="alert">
          {error}
        </span>
      )}
    </form>
  )
}

/** Polite announcements of status changes (due soon, overdue, met…), never the countdown. */
function useStatusAnnouncements(groups: readonly Group[]): string {
  const prev = useRef<Map<string, string>>(new Map())
  const [text, setText] = useState('')
  useEffect(() => {
    const changes = statusChanges(
      prev.current,
      groups,
      (g, v) =>
        `${regulationLabel(g.regulation)}, ${v.label}: ${CLOCK_STATUS_LABEL[v.status].toLowerCase()}`,
    )
    prev.current = new Map(groups.flatMap((g) => g.views.map((v) => [v.key, v.status] as const)))
    if (changes.length) setText(changes.join('. '))
  }, [groups])
  return text
}

export function RegulatoryClocks(props: RegulatoryClocksProps) {
  const { regulations, state, start, minutes } = props
  const groups = useMemo(
    () => regulationClocks(regulations, state, start.at, minutes),
    [regulations, state, start.at, minutes],
  )
  const announce = useStatusAnnouncements(groups)
  const started = groups.filter((g) => g.started)
  const waiting = groups.filter((g) => !g.started)
  if (!regulations.length) return null
  return (
    <section
      className="fac-rclocks"
      aria-labelledby="fac-rclocks-title"
      data-testid="regulatory-clocks"
    >
      <div className="fac-rclocks__header">
        <h2 id="fac-rclocks-title" className="fac-rclocks__title">
          Regulatory clocks
        </h2>
        <FireTrigger {...props} />
      </div>
      <p className="sr-only" aria-live="polite" role="status">
        {announce}
      </p>
      {started.length ? (
        <ul className="fac-rclocks__list">
          {started.flatMap((g) =>
            g.views.map((v) => <ClockRow key={v.key} group={g} view={v} props={props} />),
          )}
        </ul>
      ) : (
        <p className="muted fac-rclocks__none">
          No clock running. A clock starts when a row that starts one is delivered, or when you fire
          a trigger.
        </p>
      )}
      {waiting.length > 0 && (
        <p className="muted fac-rclocks__waiting">
          Not started: {waiting.map((g) => regulationLabel(g.regulation)).join(', ')}
        </p>
      )}
      {start.source === 'assumed' && (
        <p className="muted fac-rclocks__note">
          The scenario has no start date, so business days assume STARTEX on{' '}
          {formatScenarioDate(start.at, { year: true })}. Write the date on the STARTEX card to use
          another day.
        </p>
      )}
      <p className="muted fac-rclocks__note">{NOT_LEGAL_ADVICE}</p>
    </section>
  )
}
