// The form that opens a vote (spec 0414 FR-1, FR-2, FR-7): from an MSEL decision row or ad hoc.
// In by-role mode it asks main which roles in scope have fewer than k devices and says so
// before the vote opens.
import { useId, useState } from 'react'
import type { VoteDefinition } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { useIpcQuery } from '../../../lib/query'
import { destinationChoices } from './destinations'
import { voteForDecision } from '@shared/branching/vote-input'
import { BLANK, definitionOf, type Draft } from './vote-draft'
import { VOTES } from './vote-strings'

const COUNTDOWNS = [30, 60, 120, 300]
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function Targets({
  roles,
  value,
  onChange,
}: {
  roles: Scenario['roles']
  value: string[]
  onChange: (t: string[]) => void
}) {
  const toggle = (t: string) => {
    if (t === 'all') return onChange(['all'])
    const without = value.filter((x) => x !== 'all' && x !== t)
    const next = value.includes(t) ? without : [...without, t]
    onChange(next.length ? next : ['all'])
  }
  return (
    <fieldset className="fac-live__targets">
      <legend className="field__label">{VOTES.whoLegend}</legend>
      {destinationChoices(roles).map((c) => (
        <label key={c.value} className="fac-live__check">
          <input
            type="checkbox"
            checked={value.includes(c.value)}
            onChange={() => toggle(c.value)}
          />
          {c.label}
        </label>
      ))}
    </fieldset>
  )
}

function ScopeWarning(props: {
  projectPath: string
  scenarioId: string
  targets: string[]
  k: number
}) {
  const scope = useIpcQuery('live:vote-scope', props)
  const small = scope.data?.smallRoles ?? []
  if (small.length === 0) return null
  const names = small.map(
    (r) => `${r.label} (${r.devices} ${r.devices === 1 ? 'device' : 'devices'})`,
  )
  return (
    <p className="live-warning" role="status">
      {VOTES.smallRoles(names.join(', '))}
    </p>
  )
}

export function VoteForm(props: {
  projectPath: string
  scenario: Scenario
  disabledReason?: string | undefined
  onOpen: (def: VoteDefinition, rowId?: string) => Promise<void>
}) {
  const id = useId()
  const [d, setD] = useState<Draft>(BLANK)
  const [busy, setBusy] = useState(false)
  const rows = props.scenario.msel.filter((r) => r.decision)
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const pick = (rowId: string) => {
    const dec = props.scenario.msel.find((r) => r.id === rowId)?.decision
    if (!dec) return set({ ...BLANK })
    const v = voteForDecision(dec)
    set({
      source: rowId,
      question: v.question,
      options: v.options.join('\n'),
      anonymous: v.anonymous,
      targets: v.targets,
      optionIds: v.optionIds ?? [],
      decisionId: v.decisionId ?? '',
    })
  }
  const def = definitionOf(d)
  const submit = async () => {
    if (!def) return
    setBusy(true)
    try {
      await props.onOpen(def, d.source || undefined)
      setD(BLANK)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      className="fac-votes__form"
      aria-label={VOTES.openHeading}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      {rows.length > 0 && (
        <div className="field">
          <label className="field__label" htmlFor={`${id}-src`}>
            {VOTES.source}
          </label>
          <select
            id={`${id}-src`}
            className="select"
            value={d.source}
            onChange={(e) => pick(e.target.value)}
          >
            <option value="">{VOTES.newVote}</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {VOTES.fromRow(r.id)}: {r.decision!.question.slice(0, 60)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label className="field__label" htmlFor={`${id}-q`}>
          {VOTES.question}
        </label>
        <input
          id={`${id}-q`}
          className="input"
          maxLength={300}
          value={d.question}
          onChange={(e) => set({ question: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-o`}>
          {VOTES.options}
        </label>
        <textarea
          id={`${id}-o`}
          className="textarea"
          rows={4}
          value={d.options}
          onChange={(e) => set({ options: e.target.value })}
        />
      </div>
      <fieldset className="fac-live__targets">
        <legend className="field__label">{VOTES.modeLegend}</legend>
        <label className="fac-live__check">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={d.anonymous}
            onChange={() => set({ anonymous: true })}
          />
          {VOTES.anonymous}
        </label>
        <label className="fac-live__check">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={!d.anonymous}
            onChange={() => set({ anonymous: false })}
          />
          {VOTES.byRole}
        </label>
      </fieldset>
      {!d.anonymous && (
        <>
          <div className="field">
            <label className="field__label" htmlFor={`${id}-k`}>
              {VOTES.k}
            </label>
            <select
              id={`${id}-k`}
              className="select"
              value={d.k}
              onChange={(e) => set({ k: Number(e.target.value) })}
            >
              {[2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <ScopeWarning
            projectPath={props.projectPath}
            scenarioId={props.scenario.id}
            targets={d.targets}
            k={d.k}
          />
        </>
      )}
      <Targets
        roles={props.scenario.roles}
        value={d.targets}
        onChange={(targets) => set({ targets })}
      />
      <label className="fac-live__check">
        <input
          type="checkbox"
          checked={d.allowChange}
          onChange={(e) => set({ allowChange: e.target.checked })}
        />
        {VOTES.allowChange}
      </label>
      <label className="fac-live__check">
        <input
          type="checkbox"
          checked={d.askWhy}
          onChange={(e) => set({ askWhy: e.target.checked })}
        />
        {VOTES.askWhy}
      </label>
      <label className="fac-live__check">
        <input
          type="checkbox"
          checked={d.liveResults}
          onChange={(e) => set({ liveResults: e.target.checked })}
        />
        {VOTES.liveResults}
      </label>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-t`}>
          {VOTES.countdown}
        </label>
        <select
          id={`${id}-t`}
          className="select"
          value={d.duration}
          onChange={(e) => set({ duration: e.target.value })}
        >
          <option value="">{VOTES.noCountdown}</option>
          {COUNTDOWNS.map((s) => (
            <option key={s} value={s}>
              {clock(s)}
            </option>
          ))}
        </select>
      </div>
      {props.disabledReason && <p className="muted">{props.disabledReason}</p>}
      {d.options.trim() !== '' && !def && <p className="muted">{VOTES.needTwoOptions}</p>}
      <Button type="submit" variant="primary" disabled={!def || busy || !!props.disabledReason}>
        {busy ? VOTES.opening : VOTES.open}
      </Button>
    </form>
  )
}
