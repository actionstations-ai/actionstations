import { Fragment } from 'react'
import type { Role } from '@shared/schemas/project'
import type { MselRow, Phase } from '@shared/schemas/scenario'
import { groupByPhase, toLabel } from './msel-utils'
import { injectTypeInfo } from '@shared/taxonomy'
import { TagChip } from '../../components/ui'
import { CitationChips } from './CitationChips'

const COLUMNS = [
  'Time',
  'ID',
  'From',
  'To',
  'Event / Message',
  'Expected Action',
  'Tag',
  'Format',
  'Citations',
]

function PhaseHeader({ phase }: { phase: Phase | null }) {
  return (
    <tr className="msel__phase">
      <th colSpan={COLUMNS.length} scope="colgroup">
        {phase ? (
          <>
            <span className="msel__phase-title">
              Phase {phase.index + 1}: {phase.title}{' '}
              <span className="muted">
                (Hour {phase.startTime} – {phase.endTime})
              </span>
            </span>
            {phase.goal && <span className="msel__phase-goal">Goal: {phase.goal}</span>}
          </>
        ) : (
          <span className="msel__phase-title">Rows without a phase</span>
        )}
      </th>
    </tr>
  )
}

function Row({ row, roles }: { row: MselRow; roles: Role[] }) {
  const control = ['STARTEX', 'ENDEX', 'TIME_JUMP'].includes(row.purposeTag)
  return (
    <tr className={control ? 'msel__row msel__row--control' : 'msel__row'}>
      <td className="mono">
        {row.time}
        {row.wallClock && <span className="msel__wall muted">{row.wallClock}</span>}
      </td>
      <td className="mono msel__id">{row.id}</td>
      <td>{row.from}</td>
      <td>{toLabel(row, roles)}</td>
      <td className="msel__event">{row.event}</td>
      <td className="msel__action">{row.expectedAction}</td>
      <td>
        <TagChip tag={row.purposeTag} />
      </td>
      <td>{row.format ? (injectTypeInfo(row.format)?.label ?? row.format) : '—'}</td>
      <td>
        <CitationChips citations={row.citations} />
      </td>
    </tr>
  )
}

/** Read-only MSEL, laid out like reference/scenario-3/msel.md. Editing arrives in M4. */
export function MselTable(props: { phases: Phase[]; rows: MselRow[]; roles: Role[] }) {
  if (!props.rows.length) return <p className="muted">The MSEL has no rows yet.</p>
  return (
    <div className="msel__scroll">
      <table className="table msel" aria-label="Master Scenario Events List">
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groupByPhase(props.phases, props.rows).map((g) => (
            <Fragment key={g.phase?.id ?? 'orphans'}>
              <PhaseHeader phase={g.phase} />
              {g.rows.map((r) => (
                <Row key={r.id} row={r} roles={props.roles} />
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}
