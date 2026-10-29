import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { percent, type PlayerVote } from './votes'

interface Line {
  id: string
  label: string
  count: number
}

/** Bars with the count and percent as text, so the numbers never depend on the bar length. */
export function TallyList({
  lines,
  voted,
  mine,
}: {
  lines: Line[]
  voted: number
  mine?: string | undefined
}) {
  return (
    <ul className="vote-bars">
      {lines.map((l) => {
        const pct = percent(l.count, voted)
        return (
          <li key={l.id} className="vote-bars__row">
            <span className="vote-bars__label">
              {l.label}
              {mine === l.id ? (
                <span className="vote-bars__mine"> ({STRINGS.votes.yours})</span>
              ) : null}
            </span>
            <span className="vote-bars__track" aria-hidden="true">
              <span className="vote-bars__fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="vote-bars__count">{STRINGS.votes.count(l.count, pct)}</span>
          </li>
        )
      })}
    </ul>
  )
}

function ByRole({ vote, names }: { vote: PlayerVote; names: (id: string) => string }) {
  const rows = vote.result?.byRole
  if (!rows?.length) return null
  const roles = [...new Set(rows.map((r) => r.roleId))]
  return (
    <section aria-label={STRINGS.votes.byRole}>
      <h3 className="h3">{STRINGS.votes.byRole}</h3>
      <ul className="vote-roles">
        {roles.map((role) => (
          <li key={role}>
            <strong>{role === 'other' ? 'Other' : names(role)}</strong>
            {': '}
            {vote.options
              .map((o) => {
                const n = rows.find((r) => r.roleId === role && r.optionId === o.id)?.count ?? 0
                return n > 0 ? `${o.label} ${n}` : ''
              })
              .filter(Boolean)
              .join(', ')}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The result of a closed vote, as the facilitator revealed it, with this device's own choice marked. */
export function Result({ session, vote }: { session: PlayerSession; vote: PlayerVote }) {
  const info = useStore(session.store, (s) => s.info)
  const names = (id: string) => info?.seats.find((s) => s.id === id)?.name ?? id
  const result = vote.result
  if (!result) return null
  if (!result.revealed) return <p className="muted">{STRINGS.votes.resultHidden}</p>
  const lines = vote.options.map((o) => ({
    ...o,
    count: result.results.find((r) => r.optionId === o.id)?.count ?? 0,
  }))
  return (
    <section aria-labelledby="vote-result-heading" className="vote-result">
      <h2 id="vote-result-heading" className="h3">
        {STRINGS.votes.result}
      </h2>
      <TallyList lines={lines} voted={result.voted} mine={vote.mine} />
      <p className="muted">{STRINGS.votes.votedOf(result.voted, result.eligible)}</p>
      <ByRole vote={vote} names={names} />
    </section>
  )
}
