// The clinical simulators in play (issues #1130, #1131). Three things read the same case:
//   - the evaluation: `clinicalInputsProvider` gives the clinical measures the scenario's
//     simulated events, the events players and the controller recorded on forms, and what the
//     downtime model makes of the decisions, all on the case clock;
//   - live play: `releaseDueDiscrepancies` runs after each decision and sends the seeded
//     reconciliation discrepancies that have fallen due to the players, once each;
//   - Facilitate: `downtimeStatus` shows the facilitator the consequence rules that fired and
//     where back-entry and the discrepancies stand.
import type { ClinicalDowntimeView } from '@shared/ipc/toolkits'
import type { CaseTimeMapping } from '@shared/schemas/case-data'
import type { DecisionRecord } from '@shared/schemas/decisions'
import type { GroundTruthEvent, MetricDecision } from '@shared/schemas/metrics'
import {
  DISCREPANCY_PERSONA,
  DOWNTIME_EVENTS_DATASET,
  downtimeDerivedEvents,
  downtimePlayStatus,
  downtimeSetupFrom,
  type DowntimePlayStatus,
} from '@shared/clinical/downtime-play'
import { eventsFromDecisions, onCaseClock, withCommunications } from '@shared/clinical/play-events'
import { caseDir, readManifest } from '../../case-data/store'
import { readGroundTruth } from '../../evaluation/metrics/inputs'
import type { DecisionHookContext } from '../../live/decision-hooks'
import type { MetricInputProvider } from '../metrics'

/** Ground-truth datasets the clinical simulators and a scenario author write. */
export const CLINICAL_EVENT_DATASETS = [
  'clinical-events',
  DOWNTIME_EVENTS_DATASET,
  'patient-events',
] as const

export interface ClinicalCase {
  events: GroundTruthEvent[]
  /** The case clock: the scenario's own mapping, else exercise minute 0 at the first event. */
  mapping?: CaseTimeMapping
}

/** The scenario's clinical ground truth, from whichever of the datasets it has. */
export async function readClinicalCase(root: string, scenarioId: string): Promise<ClinicalCase> {
  const manifest = await readManifest(root, scenarioId).catch(() => undefined)
  const events: GroundTruthEvent[] = []
  for (const id of CLINICAL_EVENT_DATASETS) {
    const file = manifest?.datasets.find((d) => d.id === id)?.file
    if (file) events.push(...(await readGroundTruth(caseDir(root, scenarioId), file)))
  }
  const first =
    events.find((e) => e.kind === 'downtime_start')?.time ??
    events.map((e) => e.time).sort((a, b) => Date.parse(a) - Date.parse(b))[0]
  const mapping =
    manifest?.timeMapping ??
    (first ? { caseStart: first, startOffsetMin: 0, speed: 1, jumps: [] } : undefined)
  return { events, ...(mapping ? { mapping } : {}) }
}

const dedupe = (events: readonly GroundTruthEvent[]): GroundTruthEvent[] => {
  const seen = new Set<string>()
  return events.filter((e) => {
    const k = `${e.kind}\u0000${e.id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Everything the clinical measures compare: simulated, recorded and derived events. */
export function clinicalInputs(
  c: ClinicalCase,
  given: { events?: GroundTruthEvent[]; decisions?: MetricDecision[] },
): { events: GroundTruthEvent[]; decisions: MetricDecision[] } {
  const decisions = onCaseClock(given.decisions ?? [], c.mapping)
  const setup = downtimeSetupFrom(c.events)
  const events = dedupe([
    ...(given.events ?? []),
    ...c.events,
    ...eventsFromDecisions(decisions),
    ...(setup ? downtimeDerivedEvents(setup, decisions) : []),
  ])
  return { events: withCommunications(events, decisions), decisions }
}

export const clinicalInputsProvider: MetricInputProvider = async ({ root, scenarioId, bag }) =>
  clinicalInputs(await readClinicalCase(root, scenarioId), bag ?? {})

const asPlay = (r: DecisionRecord) => ({ id: r.id, kind: r.kind, time: r.time, fields: r.fields })

/** Where the scenario's simulated downtime stands after these decisions; undefined without one. */
export async function downtimeStatus(
  root: string,
  scenarioId: string,
  records: readonly DecisionRecord[],
): Promise<DowntimePlayStatus | undefined> {
  const setup = downtimeSetupFrom((await readClinicalCase(root, scenarioId)).events)
  return setup ? downtimePlayStatus(setup, records.map(asPlay)) : undefined
}

/**
 * After a decision in a running session: send each discrepancy that has fallen due and has not
 * been sent, as a message from health information management to every team. What was sent is
 * read back from the log, so a resumed session does not send a discrepancy twice.
 */
export async function releaseDueDiscrepancies(ctx: DecisionHookContext): Promise<void> {
  if (ctx.record.kind !== 'reconcile_unit') return
  const status = await downtimeStatus(ctx.root, ctx.scenarioId, ctx.records)
  if (!status) return
  const sent = new Set(
    (await ctx.readLog())
      .filter((e) => e.kind === 'message' && e.actor.persona === DISCREPANCY_PERSONA)
      .map((e) => e.data.text),
  )
  for (const d of status.discrepancies)
    if (d.dueAt && !sent.has(d.text)) await ctx.messagePlayers(DISCREPANCY_PERSONA, d.text)
}

const FIGURES: readonly [keyof DowntimePlayStatus['state'], string][] = [
  ['resultsBacklog', 'Results waiting at recovery'],
  ['wrongPatientRisk', 'Chance a released result files to the wrong patient (%)'],
  ['duplicatesExpected', 'Duplicate records expected from back-entry'],
  ['ordersAtRisk', 'Orders and results at risk (discarded messages)'],
  ['resultHoldHours', 'Hours results are held before release'],
]

/** The status as Facilitate shows it. */
export function downtimeView(s: DowntimePlayStatus): ClinicalDowntimeView {
  return {
    label: s.label,
    start: s.start,
    recoveryAt: s.recoveryAt,
    figures: FIGURES.map(([k, label]) => ({ label, before: s.baseline[k], now: s.state[k] })),
    fired: s.fired,
    units: s.units,
    percent: s.percent,
    closed: !!s.closedAt,
    discrepancies: s.discrepancies.map((d) => ({
      id: d.id,
      threshold: d.threshold,
      text: d.text,
      due: !!d.dueAt,
    })),
  }
}
