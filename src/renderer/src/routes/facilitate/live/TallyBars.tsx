// The bars of a vote (spec 0414 FR-6), shared by the Votes tab and the presentation window.
// Every number is in the DOM as text next to the bar, so the bar length is never the only
// carrier; the leading option is marked in words as well as by color. In a by-role vote each
// bar is split by role with a legend.
import type { VoteView } from '@shared/schemas/live'
import { leaders, percentOf } from './tally-model'
import './tally-bars.css'

const SEGMENT_CLASS = ['a', 'b', 'c', 'd', 'e', 'f'] as const

function roleOrder(view: VoteView): { roleId: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const r of view.byRole ?? []) if (!seen.has(r.roleId)) seen.set(r.roleId, r.label)
  return [...seen].map(([roleId, label]) => ({ roleId, label }))
}

function Segments({
  view,
  optionId,
  roles,
}: {
  view: VoteView
  optionId: string
  roles: ReturnType<typeof roleOrder>
}) {
  const total = Math.max(1, view.voted)
  return (
    <>
      {roles.map((role, i) => {
        const n =
          view.byRole?.find((r) => r.roleId === role.roleId && r.optionId === optionId)?.count ?? 0
        if (n === 0) return null
        return (
          <span
            key={role.roleId}
            className={`tally__segment tally__segment--${SEGMENT_CLASS[i % SEGMENT_CLASS.length]}`}
            style={{ width: `${(n / total) * 100}%` }}
            title={`${role.label}: ${n}`}
          />
        )
      })}
    </>
  )
}

export function TallyBars({ view, large = false }: { view: VoteView; large?: boolean }) {
  const top = leaders(view)
  const roles = roleOrder(view)
  return (
    <div className={`tally${large ? ' tally--large' : ''}`}>
      {roles.length > 0 && (
        <ul className="tally__legend" aria-label="Roles">
          {roles.map((r, i) => (
            <li key={r.roleId}>
              <span
                className={`tally__swatch tally__segment--${SEGMENT_CLASS[i % SEGMENT_CLASS.length]}`}
                aria-hidden="true"
              />
              {r.label}
            </li>
          ))}
        </ul>
      )}
      <ul className="tally__list">
        {view.options.map((o) => {
          const pct = percentOf(o.count, view.voted)
          const leading = top.has(o.id)
          return (
            <li key={o.id} className={`tally__row${leading ? ' is-leading' : ''}`}>
              <span className="tally__label">
                {o.label}
                {leading && <span className="tally__flag"> (leading)</span>}
              </span>
              <span className="tally__track" aria-hidden="true">
                {roles.length > 0 ? (
                  <Segments view={view} optionId={o.id} roles={roles} />
                ) : (
                  <span className="tally__fill" style={{ width: `${pct}%` }} />
                )}
              </span>
              <span className="tally__count">
                <strong>{o.count}</strong> <span className="tally__pct">{pct} %</span>
              </span>
              {roles.length > 0 && o.count > 0 && (
                <span className="tally__roles">
                  {roles
                    .map((r) => {
                      const n =
                        view.byRole?.find((x) => x.roleId === r.roleId && x.optionId === o.id)
                          ?.count ?? 0
                      return n > 0 ? `${r.label} ${n}` : ''
                    })
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
