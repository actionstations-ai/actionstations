// Structure rubric for a drafted MSEL against the gold standard (#434, FR-12): pass/fail items
// with weights from the suite file; the score is the weighted share passed. `gold` is
// bench/gold/scenario-3.json (scripts/bench/gold.mjs).
import { contentRows } from './util.mjs'

export const RUBRIC_ITEMS = [
  'pace',
  'tagMix',
  'decisionPhase',
  'startEnd',
  'rolesEveryPhase',
  'briefIds',
  'noReferenceLeak',
]

/**
 * Content rows per hour within the gold's per-phase band scaled by `band` ([0.5, 2]: from half
 * the gold's slowest phase to twice its busiest).
 */
export function paceOk(scenario, gold, band) {
  const hours = scenario.brief?.durationHours || 4
  const rate = contentRows(scenario.msel).length / hours
  const lo = gold.rowsPerHour.min * band[0]
  const hi = gold.rowsPerHour.max * band[1]
  return { pass: rate >= lo && rate <= hi, rate }
}

const tagsOf = (msel) => new Set(msel.map((r) => r.purposeTag))

/** Every tag group the gold covers has at least one row. */
export function tagMixOk(scenario, gold) {
  const tags = tagsOf(scenario.msel)
  const missing = gold.groups.filter((g) => !g.some((t) => tags.has(t))).map((g) => g.join('|'))
  return { pass: missing.length === 0, missing }
}

/** A decision point sits in a middle phase (any phase when there are fewer than three). */
export function decisionPhaseOk(scenario) {
  const index = new Map(scenario.phases.map((p) => [p.id, p.index]))
  const last = scenario.phases.length - 1
  const dps = scenario.msel.filter((r) => r.purposeTag === 'DECISION_POINT')
  if (last < 2) return dps.length > 0
  return dps.some((r) => {
    const i = index.get(r.phaseId)
    return i !== undefined && i > 0 && i < last
  })
}

export const startEndOk = (msel) =>
  msel[0]?.purposeTag === 'STARTEX' && msel.at(-1)?.purposeTag === 'ENDEX'

const toAll = (r) => !r.toRoleIds?.length && /\ball\b/i.test(r.toLabel ?? '')

/** Every player role receives an inject in every phase; returns the gaps. */
export function roleGaps(scenario) {
  const gaps = []
  for (const phase of scenario.phases) {
    const rows = scenario.msel.filter((r) => r.phaseId === phase.id)
    for (const role of scenario.roles) {
      if (!rows.some((r) => toAll(r) || r.toRoleIds?.includes(role.id)))
        gaps.push(`${phase.index}:${role.id}`)
    }
  }
  return gaps
}

/** Item results (true = pass) and the weighted score. */
export function rubricScore(scenario, lints, gold, weights, band) {
  const codes = new Set(lints.map((w) => w.code))
  const pace = paceOk(scenario, gold, band)
  const mix = tagMixOk(scenario, gold)
  const gaps = scenario.phases.length && scenario.roles.length ? roleGaps(scenario) : ['none']
  const items = {
    pace: pace.pass,
    tagMix: mix.pass,
    decisionPhase: decisionPhaseOk(scenario),
    startEnd: startEndOk(scenario.msel),
    rolesEveryPhase: gaps.length === 0,
    briefIds: !codes.has('BRIEF_IDS_MISSING'),
    noReferenceLeak: !codes.has('REFERENCE_LEAK'),
  }
  // An empty MSEL passes nothing: the lint-based items would otherwise pass by default.
  if (!scenario.msel.length) for (const k of RUBRIC_ITEMS) items[k] = false
  let passed = 0
  let total = 0
  for (const k of RUBRIC_ITEMS) {
    const w = weights[k] ?? 0
    total += w
    if (items[k]) passed += w
  }
  return {
    score: total > 0 ? (passed / total) * 100 : 0,
    items,
    rowsPerHour: Math.round(pace.rate * 100) / 100,
    missingTagGroups: mix.missing,
    roleGaps: gaps.length,
  }
}
