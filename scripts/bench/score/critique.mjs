// Critique scores (#434, FR-14, #592): recall of the planted defects, and noise: notes on rows
// that carry no planted defect and no lint finding, per 10 rows. Some noise notes may be valid,
// so noise is weighted lightly in the suite file. A defect counts as found when a note names it
// or the revised scenario no longer has it ("fixed"); the revision breaking correct rows is
// measured as damage (score/damage.mjs).
import { isFixed, noteMatches } from '../defects.mjs'
import { damageScore } from './damage.mjs'

export const critiqueNotes = (warnings) =>
  warnings.filter((w) => w.source === 'critique' || w.code === 'CRITIQUE')

/**
 * `notes`: the critique notes; `planted`: from applyDefects; `lints`: scenarios:lint findings
 * (their rows are fair game for a note); `rowCount`: rows in the critiqued MSEL;
 * `noisePenalty`: points lost per noise note per 10 rows. `before` and `after`: the MSEL rows
 * before the critique (planted defects in place) and after its revision; without `after`
 * nothing counts as fixed and no row as damaged. `damagePenalty`: points lost per percent of
 * weighted damage.
 */
export function critiqueScore({
  notes,
  planted,
  lints,
  rowCount,
  noisePenalty,
  before = [],
  after,
  damagePenalty = 2,
}) {
  const noted = planted.filter((d) => notes.some((n) => noteMatches(n, d)))
  const fixed = after ? planted.filter((d) => isFixed(d, after)) : []
  const found = planted.filter((d) => noted.includes(d) || fixed.includes(d))
  const share = (list) => (planted.length ? (list.length / planted.length) * 100 : 0)
  const harm = after
    ? damageScore({ before, after, planted, penalty: damagePenalty })
    : { damage: 0, intact: 100, damaged: [] }
  const known = new Set([
    ...planted.flatMap((d) => d.rows),
    ...lints.map((w) => w.rowId).filter(Boolean),
  ])
  const noise = notes.filter((n) => n.rowId && !known.has(n.rowId)).length
  const noisePer10 = rowCount > 0 ? (noise / rowCount) * 10 : 0
  return {
    recall: share(found),
    noted: share(noted),
    fixed: share(fixed),
    damage: harm.damage,
    intact: harm.intact,
    noise: Math.max(0, 100 - noisePer10 * noisePenalty),
    noisePer10Rows: Math.round(noisePer10 * 100) / 100,
    notes: notes.length,
    found: found.map((d) => d.id),
    notedIds: noted.map((d) => d.id),
    fixedIds: fixed.map((d) => d.id),
    damaged: harm.damaged,
    missed: planted.filter((d) => !found.includes(d)).map((d) => d.id),
  }
}
