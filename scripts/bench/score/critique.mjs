// Critique scores (#434, FR-14): recall of the planted defects, and noise: notes on rows that
// carry no planted defect and no lint finding, per 10 rows. Some noise notes may be valid, so
// noise is weighted lightly in the suite file.
import { noteMatches } from '../defects.mjs'

export const critiqueNotes = (warnings) =>
  warnings.filter((w) => w.source === 'critique' || w.code === 'CRITIQUE')

/**
 * `notes`: the critique notes; `planted`: from applyDefects; `lints`: scenarios:lint findings
 * (their rows are fair game for a note); `rowCount`: rows in the critiqued MSEL;
 * `noisePenalty`: points lost per noise note per 10 rows.
 */
export function critiqueScore({ notes, planted, lints, rowCount, noisePenalty }) {
  const found = planted.filter((d) => notes.some((n) => noteMatches(n, d)))
  const known = new Set([
    ...planted.flatMap((d) => d.rows),
    ...lints.map((w) => w.rowId).filter(Boolean),
  ])
  const noise = notes.filter((n) => n.rowId && !known.has(n.rowId)).length
  const noisePer10 = rowCount > 0 ? (noise / rowCount) * 10 : 0
  return {
    recall: planted.length ? (found.length / planted.length) * 100 : 0,
    noise: Math.max(0, 100 - noisePer10 * noisePenalty),
    noisePer10Rows: Math.round(noisePer10 * 100) / 100,
    notes: notes.length,
    found: found.map((d) => d.id),
    missed: planted.filter((d) => !found.includes(d)).map((d) => d.id),
  }
}
