// The Engagement section of the inject editor (spec 0428 FR-9): how a social post's counts grow
// after delivery and which replies appear when. A small chart previews the first count and a
// table gives the same numbers in text.
import { useId } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { engagementAt, newPlan } from '@shared/facilitator/engagement'
import { metricNames } from '@shared/facilitator/engagement-fields'
import type { EngagementPlan } from '@shared/schemas/inject'
import { type EngagementReply } from '@shared/schemas/inject'
import { Button } from '../../components/ui'

const CURVES: { value: EngagementPlan['curve']; label: string }[] = [
  { value: 'surge', label: 'Surge: slow, then fast, then flat' },
  { value: 'steady', label: 'Steady: a constant climb' },
  { value: 'fade', label: 'Fade: fast at first, then flat' },
]

const nonNegative = (text: string): number => {
  const n = Math.floor(Number(text))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function NumberField(props: { label: string; value: number; onChange: (n: number) => void }) {
  const id = useId()
  return (
    <div className="field engagement__num">
      <label className="field__label" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="input"
        type="number"
        min={0}
        value={props.value}
        onChange={(e) => props.onChange(nonNegative(e.target.value))}
      />
    </div>
  )
}

function Preview({ plan, metrics }: { plan: EngagementPlan; metrics: string[] }) {
  const first = metrics[0]
  const times = [0, 0.25, 0.5, 0.75, 1, 2].map((f) => Math.round(plan.peakAtMin * f))
  const rows = times.map((m) => ({ m, counts: engagementAt(plan, m) }))
  const max = Math.max(1, ...rows.map((r) => (first ? (r.counts[first] ?? 0) : 0)))
  const points = rows
    .map(
      (r, i) =>
        `${(i / (rows.length - 1)) * 100},${30 - ((first ? (r.counts[first] ?? 0) : 0) / max) * 28}`,
    )
    .join(' ')
  return (
    <div className="engagement__preview">
      <svg viewBox="0 0 100 32" role="img" aria-label={`Preview of ${first ?? 'counts'} over time`}>
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      <table className="engagement__table">
        <caption className="sr-only">Counts by minutes after delivery</caption>
        <thead>
          <tr>
            <th scope="col">Minutes after delivery</th>
            {metrics.map((n) => (
              <th key={n} scope="col">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.m}>
              <th scope="row">{r.m}</th>
              {metrics.map((n) => (
                <td key={n}>{(r.counts[n] ?? 0).toLocaleString()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReplyRow(props: {
  reply: EngagementReply
  onChange: (r: EngagementReply) => void
  onRemove: () => void
}) {
  const { reply: r } = props
  const id = useId()
  return (
    <li className="engagement__reply">
      <div className="field">
        <label className="field__label" htmlFor={`${id}-a`}>
          Author
        </label>
        <input
          id={`${id}-a`}
          className="input"
          maxLength={80}
          value={r.author}
          onChange={(e) => props.onChange({ ...r, author: e.target.value })}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor={`${id}-h`}>
          Handle
        </label>
        <input
          id={`${id}-h`}
          className="input"
          maxLength={40}
          value={r.handle ?? ''}
          onChange={(e) => {
            const { handle: _drop, ...rest } = r
            props.onChange(e.target.value ? { ...rest, handle: e.target.value } : rest)
          }}
        />
      </div>
      <NumberField
        label="Minutes after delivery"
        value={r.atMin}
        onChange={(n) => props.onChange({ ...r, atMin: Math.min(600, n) })}
      />
      <div className="field engagement__text">
        <label className="field__label" htmlFor={`${id}-t`}>
          Reply
        </label>
        <textarea
          id={`${id}-t`}
          className="textarea"
          rows={2}
          maxLength={560}
          value={r.text}
          onChange={(e) => props.onChange({ ...r, text: e.target.value })}
        />
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={props.onRemove}
        aria-label={`Remove reply by ${r.author || 'unnamed'}`}
      >
        <Trash2 size={14} aria-hidden /> Remove
      </Button>
    </li>
  )
}

export interface EngagementSectionProps {
  type: string
  fields: Record<string, unknown>
  plan: EngagementPlan | undefined
  purposeTag?: string | undefined
  onChange: (plan: EngagementPlan | undefined) => void
}

export function EngagementSection(props: EngagementSectionProps) {
  const { plan, type } = props
  const metrics = metricNames(type)
  if (metrics.length === 0) return null
  const set = (patch: Partial<EngagementPlan>) => plan && props.onChange({ ...plan, ...patch })
  return (
    <fieldset className="editor-section engagement">
      <legend>Engagement</legend>
      {!plan ? (
        <>
          <p className="field__hint">
            Make the counts and replies on this post grow while the exercise runs. Leave it off for
            a post that stays as written.
          </p>
          <Button onClick={() => props.onChange(newPlan(type, props.fields, props.purposeTag))}>
            <Plus size={14} aria-hidden /> Add an engagement plan
          </Button>
        </>
      ) : (
        <>
          <div className="field">
            <label className="field__label" htmlFor="engagement-curve">
              Growth
            </label>
            <select
              id="engagement-curve"
              className="select"
              value={plan.curve}
              onChange={(e) => set({ curve: e.target.value as EngagementPlan['curve'] })}
            >
              {CURVES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <NumberField
            label="Minutes to reach the peak"
            value={plan.peakAtMin}
            onChange={(n) => set({ peakAtMin: Math.min(600, Math.max(1, n)) })}
          />
          <div className="engagement__counts">
            {metrics.map((name) => (
              <div key={name} className="engagement__metric" role="group" aria-label={name}>
                <NumberField
                  label={`${name}: at delivery`}
                  value={plan.start[name] ?? 0}
                  onChange={(n) => set({ start: { ...plan.start, [name]: n } })}
                />
                <NumberField
                  label={`${name}: at the peak`}
                  value={plan.peak[name] ?? 0}
                  onChange={(n) => set({ peak: { ...plan.peak, [name]: n } })}
                />
              </div>
            ))}
          </div>
          <Preview plan={plan} metrics={metrics} />
          <h3 className="engagement__replies-title">Replies</h3>
          <ul className="engagement__replies">
            {plan.replies.map((r, i) => (
              <ReplyRow
                key={r.id}
                reply={r}
                onChange={(next) =>
                  set({ replies: plan.replies.map((x, k) => (k === i ? next : x)) })
                }
                onRemove={() => set({ replies: plan.replies.filter((_, k) => k !== i) })}
              />
            ))}
          </ul>
          <div className="row">
            <Button
              onClick={() =>
                set({
                  replies: [
                    ...plan.replies,
                    { id: `r${Date.now().toString(36)}`, atMin: 5, author: '', text: '' },
                  ].slice(0, 40),
                })
              }
            >
              <Plus size={14} aria-hidden /> Add a reply
            </Button>
            <Button variant="ghost" onClick={() => props.onChange(undefined)}>
              Remove the plan
            </Button>
          </div>
        </>
      )}
    </fieldset>
  )
}
