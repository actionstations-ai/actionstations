// Plan seam checks (#427, FR-11) and the seam need of the mix completion pass. Pure: the
// scenario's seam snapshot and rows are all they read; the plan check's file is passed in
// where a caller has it (SEAM_OUTDATED).
import type {
  LintWarning,
  MselRow,
  Phase,
  PlanFinding,
  Scenario,
  ScenarioSeam,
} from '@shared/schemas'
import { isSeam, seamChunkIds, SEAM_TAGS } from '@shared/seams'

export const SEAM_NOT_TESTED = 'SEAM_NOT_TESTED'
export const SEAM_CITATION_MISSING = 'SEAM_CITATION_MISSING'
export const SEAM_WEAK_TAG = 'SEAM_WEAK_TAG'
export const SEAM_OUTDATED = 'SEAM_OUTDATED'
/** Pipeline note: no row was written for a seam, so code gave it one (like DECISION_POINT_RETAGGED). */
export const SEAM_ROW_ASSIGNED = 'SEAM_ROW_ASSIGNED'

type W = LintWarning

const CONTROL = new Set<MselRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])
const WEAK = new Set<MselRow['purposeTag']>(['NOISE', 'RED_HERRING'])

/** The seam's S key in prompts: its place in the scenario's list, "S1".."S3". */
export const seamKey = (s: Pick<Scenario, 'seams'>, seamId: string): string | undefined => {
  const i = s.seams.findIndex((x) => x.id === seamId)
  return i < 0 ? undefined : `S${i + 1}`
}

/** "s1", " S1 ", "S-1" → "S1"; anything else → undefined. */
export function normalizeSeamKey(raw: string | undefined): string | undefined {
  const m = /^\s*s\s*-?\s*(\d+)\s*$/i.exec(raw ?? '')
  return m ? `S${Number(m[1])}` : undefined
}

/** S key → seam id for the scenario's seams. */
export const seamKeyMap = (s: Pick<Scenario, 'seams'>): Map<string, string> =>
  new Map(s.seams.map((x, i) => [`S${i + 1}`, x.id]))

export const seamRows = (s: Pick<Scenario, 'msel'>, seamId: string): MselRow[] =>
  s.msel.filter((r) => r.seamId === seamId)

/** Seams placed in this phase (FR-5). */
export const phaseSeams = (s: Pick<Scenario, 'seams'>, phaseId: string): ScenarioSeam[] =>
  (s.seams ?? []).filter((x) => x.phaseId === phaseId)

/** Whether the row cites the passage's chunk. */
export const citesChunk = (row: MselRow, chunkId: number): boolean =>
  row.citations.some((c) => c.chunkId === chunkId)

/** A row may carry a seam: not a control card. */
export const canCarrySeam = (row: MselRow): boolean => !CONTROL.has(row.purposeTag)

/** Rows exist where the seam should be tested, so a missing seam row is a finding. */
function seamDue(s: Scenario, seam: ScenarioSeam): boolean {
  if (seam.phaseId) return s.msel.some((r) => r.phaseId === seam.phaseId)
  return s.msel.length > 0
}

const label = (seam: ScenarioSeam): string => `plan seam "${seam.slotLabel}"`

function rowChecks(s: Scenario, seam: ScenarioSeam): W[] {
  const ids = seamChunkIds(seam)
  return seamRows(s, seam.id).flatMap((row): W[] => {
    const out: W[] = []
    if (!ids.every((id) => citesChunk(row, id)))
      out.push({
        code: SEAM_CITATION_MISSING,
        severity: 'warning',
        message: `Row ${row.id} tests ${label(seam)} but does not cite both passages`,
        rowId: row.id,
        source: 'lint',
        suggestion: 'Re-run the phase or add the missing passage to the row’s sources',
      })
    if (WEAK.has(row.purposeTag))
      out.push({
        code: SEAM_WEAK_TAG,
        severity: 'info',
        message: `Row ${row.id} tests ${label(seam)} but is tagged ${row.purposeTag}; players may dismiss it`,
        rowId: row.id,
        source: 'lint',
        suggestion: `Tag it ${SEAM_TAGS.join(', ')}`,
      })
    return out
  })
}

/** FR-11: SEAM_NOT_TESTED, SEAM_CITATION_MISSING and SEAM_WEAK_TAG. */
export function lintSeams(s: Scenario): W[] {
  return s.seams.flatMap((seam): W[] => {
    const rows = seamRows(s, seam.id)
    const missing: W[] =
      !rows.length && seamDue(s, seam)
        ? [
            {
              code: SEAM_NOT_TESTED,
              severity: 'warning',
              message: `No inject tests ${label(seam)}`,
              source: 'lint',
              suggestion: 'Repair the scenario or re-run the phase the seam is planned for',
            },
          ]
        : []
    return [...missing, ...rowChecks(s, seam)]
  })
}

/**
 * FR-11 SEAM_OUTDATED: a selected seam whose finding the plan check no longer lists as a seam
 * (dismissed, outdated after a re-ingest, judged consistent, or gone from the file).
 */
export function lintSeamsOutdated(s: Scenario, findings: readonly PlanFinding[] | undefined): W[] {
  if (!s.seams.length || !findings) return []
  const byId = new Map(findings.map((f) => [f.id, f]))
  return s.seams.flatMap((seam): W[] => {
    const f = byId.get(seam.id)
    if (f && isSeam(f)) return []
    return [
      {
        code: SEAM_OUTDATED,
        severity: 'info',
        message: `The plans no longer disagree on ${label(seam)} (${f ? f.status : 'no longer found'} in the plan check)`,
        source: 'lint',
        suggestion: 'Keep the inject as history, or re-run the phase without this seam',
      },
    ]
  })
}

/** The mix pass's ask for a seam the phase should test and no row tests yet (FR-4). */
export interface SeamGap {
  code: typeof SEAM_NOT_TESTED
  need: string
  message: string
  seamId: string
}

export function seamMixGaps(s: Scenario, phase: Phase): SeamGap[] {
  return phaseSeams(s, phase.id)
    .filter((seam) => !seamRows(s, seam.id).length)
    .map((seam) => ({
      code: SEAM_NOT_TESTED,
      seamId: seam.id,
      message: `No inject tests ${label(seam)} in phase ${phase.index + 1}`,
      need: `one inject that puts players in plan seam ${seamKey(s, seam.id)} (${seam.slotLabel}): set "seam" to "${seamKey(s, seam.id)}", cite both of its passages, tag it ${SEAM_TAGS.join(' or ')}, and do not tell players the plans disagree`,
    }))
}
