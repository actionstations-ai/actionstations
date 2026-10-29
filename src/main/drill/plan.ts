// Drafting a regression drill (#431, FR-8): the rows whose criteria were last rated not met or
// partial, the corrective actions and redlines that answer them, and the plans that should be
// updated first. Nothing is written; the designer reviews the draft and saves it.
import type { DrillPlan, Finding, Redline } from '@shared/schemas'
import { buildExerciseRecord } from '../aar/record'
import { readAar } from '../aar/store'
import { rowCriteria } from '../generate/eeg-criteria'
import { listRedlines } from '../redline/store'
import { criterionRows, latestRatings, observationKeys, ratingKey } from './ratings'

const FAILED = new Set(['not_met', 'partial'])

type Evidenced = Parameters<typeof observationKeys>[0] & { ref: string }

/** The failed criteria (`rowId|criterionId`) a finding's evidence points at. */
function linkedKeys(
  f: Finding,
  failed: ReadonlyMap<string, unknown>,
  observations: Evidenced[],
  rowsOf: ReadonlyMap<string, string[]>,
): Set<string> {
  const out = new Set<string>()
  const byRef = new Map(observations.map((o) => [o.ref, o]))
  for (const ref of f.evidence) {
    const obs = byRef.get(ref)
    if (obs) for (const key of observationKeys(obs, rowsOf)) if (failed.has(key)) out.add(key)
    if (ref.startsWith('note:'))
      for (const key of failed.keys()) if (key.startsWith(`${ref.slice(5)}|`)) out.add(key)
  }
  return out
}

function matchingRedlines(redlines: Redline[], findingIds: Set<string>, criterionIds: Set<string>) {
  return redlines.filter(
    (r) =>
      r.status !== 'rejected' &&
      ((r.source.findingId && findingIds.has(r.source.findingId)) ||
        r.source.criterionIds.some((c) => criterionIds.has(c))),
  )
}

export async function draftDrill(
  root: string,
  scenarioId: string,
  sessionId?: string,
): Promise<DrillPlan> {
  const { scenario, record } = await buildExerciseRecord(
    root,
    scenarioId,
    sessionId ? { sessionId } : {},
  )
  const rated = latestRatings(scenario, record.observations)
  const failed = new Map(
    rated.filter((r) => FAILED.has(r.rating)).map((r) => [ratingKey(r.rowId, r.criterionId), r]),
  )
  const failedRows = new Set([...failed.values()].map((r) => r.rowId))
  const rowsOf = criterionRows(scenario)
  const criterionIds = new Set([...failed.values()].map((r) => r.criterionId))

  const aar = await readAar(root, scenarioId)
  const findings = aar?.capabilities.flatMap((c) => c.areasForImprovement) ?? []
  const actionCriteria: Record<string, string[]> = {}
  const findingIds = new Set<string>()
  for (const f of findings) {
    const keys = linkedKeys(f, failed, record.observations, rowsOf)
    if (!keys.size) continue
    findingIds.add(f.id)
    for (const a of f.correctiveActions) actionCriteria[a.programActionId ?? a.id] = [...keys]
  }
  const redlines = matchingRedlines(
    await listRedlines(root, { scenarioId }),
    findingIds,
    criterionIds,
  )
  const cited = rowCriteria(scenario)
    .filter((c) => failed.has(ratingKey(c.rowId, c.id)) && c.citation)
    .map((c) => c.citation!.documentId)
  return {
    formatVersion: 1,
    title: `Regression drill: ${scenario.title}`.slice(0, 300),
    sourceScenarioId: scenarioId,
    ...(sessionId ? { sourceSessionId: sessionId } : {}),
    rowIds: scenario.msel.filter((r) => failedRows.has(r.id)).map((r) => r.id),
    criterionIds: [...criterionIds],
    correctiveActionIds: Object.keys(actionCriteria),
    actionCriteria,
    redlineIds: redlines.map((r) => r.id),
    expectedDocumentIds: [...new Set([...redlines.map((r) => r.target.documentId), ...cited])],
  }
}
