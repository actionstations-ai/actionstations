// The coverage report of one scenario (#426, FR-13/14): enabled frameworks and regulations,
// the MSEL, the facilitator session and the evaluator observations, through the pure builder
// in src/shared/compliance/coverage.ts. Used by compliance:coverage, the coverage exports and
// the AAR draft (#419).
import { buildCoverage, type CoverageReport } from '@shared/compliance/coverage'
import { scenarioStart } from '@shared/compliance/scenario-time'
import { sessionOf } from '@shared/schemas/compliance'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { Scenario } from '@shared/schemas/scenario'
import { readEvaluation } from '../evaluation/store'
import { readFacilitatorState } from '../facilitator/state'
import { loadProject } from '../project/store'
import { getScenario } from '../scenario/store'
import { isEnabled, layeredItems } from './registry'

/** Exercise minutes on the facilitator clock at `now`. */
export function facilitatorMinutes(state: FacilitatorState, now: Date): number {
  const since = state.runningSince ? Date.parse(state.runningSince) : NaN
  if (Number.isNaN(since)) return state.elapsedMin
  return state.elapsedMin + Math.max(0, now.getTime() - since) / 60_000
}

/** STARTEX on the scenario calendar (brief date, STARTEX card, or next Monday). */
export function startOf(scenario: Scenario, today = new Date()) {
  const startex = scenario.msel.find((r) => r.purposeTag === 'STARTEX')
  return scenarioStart(
    {
      startDate: scenario.brief.startDate,
      startWallClock: scenario.brief.startWallClock,
      startexText: startex?.event,
    },
    today,
  )
}

export async function scenarioCoverage(
  root: string,
  scenarioId: string,
  now = new Date(),
): Promise<CoverageReport> {
  const [project, scenario, state, evaluation] = await Promise.all([
    loadProject(root),
    getScenario(root, scenarioId),
    readFacilitatorState(root, scenarioId),
    readEvaluation(root, scenarioId),
  ])
  const session = sessionOf(state)
  const firedRegs = new Set(session.fired.map((f) => f.regulationId))
  const regulations = (await layeredItems(root, 'regulations'))
    .map((l) => l.item)
    .filter((r) => isEnabled(project, 'regulations', r.id) || firedRegs.has(r.id))
  const frameworks = (await layeredItems(root, 'frameworks'))
    .map((l) => l.item)
    .filter((f) => isEnabled(project, 'frameworks', f.id))
  return buildCoverage({
    scenarioTitle: scenario.title,
    msel: scenario.msel,
    threatFamily: scenario.brief.threatFamily,
    frameworks,
    regulations,
    session,
    start: startOf(scenario, now),
    nowMin: facilitatorMinutes(state, now),
    delivered: state.delivered,
    notes: state.notes,
    observedRows: new Set(evaluation.observations.flatMap((o) => (o.rowId ? [o.rowId] : []))),
  })
}
