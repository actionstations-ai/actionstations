// The PREP exercise cycles of the program (spec 0455 FR-10, #782): for each plan holder, where the
// cycle stands, which of the 15 core components its exercises have covered, whether a worst case
// discharge was exercised and which plan countermeasures are still open. Shown only when a linked
// project has a PREP exercise. Generic exercise guidance, not a finding that a plan complies.
import { prepCycles, type PrepCycleView, type PrepProgramExercise } from '@shared/prep/program'
import { useIpcQuery } from '../../lib/query'
import type { ProgramContext } from './ProgramFrame'

function Cycle({ view }: { view: PrepCycleView }) {
  const headingId = `prep-${view.key.replace(/[^a-z0-9]+/g, '-')}`
  const { coverage } = view
  return (
    <section aria-labelledby={headingId} className="stack">
      <h3 id={headingId}>
        {view.planHolder || 'Plan holder not named'}{' '}
        <span className="muted">({view.planTypeLabel})</span>
      </h3>
      <p>{view.cycleLine || 'No cycle start date is set, so every exercise below counts.'}</p>
      <p>
        {coverage.covered} of {coverage.applicable} core components covered ({coverage.percent}%).{' '}
        {coverage.missing.length > 0
          ? `Not yet covered: ${coverage.rows
              .filter((r) => coverage.missing.includes(r.component.id))
              .map((r) => r.component.name)
              .join(', ')}.`
          : 'Every applicable component has been exercised.'}
      </p>
      <p>
        {view.worstCaseDischarge
          ? 'A worst case discharge scenario was exercised in this cycle.'
          : 'No worst case discharge scenario has been exercised in this cycle yet.'}{' '}
        {view.countermeasuresMissing.length > 0
          ? `Countermeasures in the plan not yet exercised: ${view.countermeasuresMissing.join(', ')}.`
          : ''}
      </p>
      {view.outsideCycle > 0 && (
        <p className="muted">
          {view.outsideCycle} exercise(s) are dated outside this cycle (or have no date) and are not
          counted.
        </p>
      )}
      <table className="table">
        <caption className="sr-only">
          Core components exercised for {view.planHolder || 'this plan holder'}
        </caption>
        <thead>
          <tr>
            <th scope="col">Core component</th>
            <th scope="col">Exercises</th>
            <th scope="col">First exercised</th>
          </tr>
        </thead>
        <tbody>
          {coverage.rows.map((r) => (
            <tr key={r.component.id}>
              <th scope="row">
                {r.component.ref} {r.component.name}
              </th>
              <td>{r.applicable ? r.count : 'Not applicable to the plan'}</td>
              <td>{r.applicable && r.firstDate ? r.firstDate : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Exercises counted:{' '}
        {view.exercises.map((e) => `${e.title} (${e.projectName}, ${e.prep.date})`).join('; ') ||
          'none'}
      </p>
    </section>
  )
}

export function PrepCard({ ctx }: { ctx: ProgramContext }) {
  const snaps = useIpcQuery('program:snapshots', { programPath: ctx.programPath })
  const exercises: PrepProgramExercise[] = (snaps.data ?? []).flatMap((p) =>
    p.scenarios.flatMap((s) =>
      s.prep
        ? [{ projectName: p.name, scenarioId: s.scenarioId, title: s.title, prep: s.prep }]
        : [],
    ),
  )
  if (exercises.length === 0) return null
  const cycles = prepCycles(exercises)
  return (
    <section className="card stack" aria-labelledby="program-prep">
      <h2 id="program-prep">PREP exercise cycles</h2>
      <p className="muted">
        The linked projects&apos; PREP exercises, grouped by plan holder and plan type. The
        guidelines are voluntary; your plan and your regulator decide what satisfies the plan.
      </p>
      {cycles.map((c) => (
        <Cycle key={c.key} view={c} />
      ))}
    </section>
  )
}
