// Timeline filter (spec 0428 FR-7): show only the rows addressed to a team or a role. The
// choice is kept per scenario on this computer.
import type { Role } from '@shared/schemas/project'
import { teamNames } from '@shared/facilitator/recipients'
import type { TimelineFilterValue } from './use-timeline-filter'

/** Chips for the teams and roles; one is on at a time, and "Everyone" clears it. */
export function TimelineFilter(props: {
  roles: Role[]
  value: TimelineFilterValue
  onChange: (v: TimelineFilterValue) => void
}) {
  const teams = teamNames(props.roles)
  if (props.roles.length === 0) return null
  const none = !props.value.team && !props.value.roleId
  return (
    <div className="fac-filter" role="group" aria-label="Show rows for">
      <button
        type="button"
        className="fac-filter__chip"
        aria-pressed={none}
        onClick={() => props.onChange({})}
      >
        Everyone
      </button>
      {teams.map((t) => (
        <button
          key={`t-${t}`}
          type="button"
          className="fac-filter__chip"
          aria-pressed={props.value.team === t}
          onClick={() => props.onChange({ team: t })}
        >
          {t} team
        </button>
      ))}
      {props.roles.map((r) => (
        <button
          key={`r-${r.id}`}
          type="button"
          className="fac-filter__chip"
          aria-pressed={props.value.roleId === r.id}
          onClick={() => props.onChange({ roleId: r.id })}
        >
          {r.abbreviation || r.name}
        </button>
      ))}
    </div>
  )
}
