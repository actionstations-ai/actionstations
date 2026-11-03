// Critique damage (#592): a critique stage also revises the scenario, and a revision that breaks
// correct rows is a cost the notes do not show. Compare the rows before the critique (the
// scenario with the planted defects) with the rows after it. A row outside the planted defects
// is damaged when it was removed, its sender changed, or its event or expected action was
// rewritten past the point of being the same text. Rows whose content is deliberate (pressure,
// misinformation, clues) weigh most.
import { overlap, similarity } from '../defects.mjs'

/** A rewrite keeps less than this share of the words. Looser than a defect fix: rewording, or a
 * qualifier added to a sender ("Media Monitoring Dashboard (Channel 12)"), is not damage. */
export const REWRITTEN = 0.6

const DELIBERATE = new Set(['PRESSURE', 'MISINFORMATION', 'CLUE', 'RED_HERRING'])
const DELIBERATE_WEIGHT = 3

export const rowWeight = (row) => (DELIBERATE.has(row.purposeTag) ? DELIBERATE_WEIGHT : 1)

/** Which of event, expectedAction and from changed materially; empty when the row is intact. */
export function changedFields(before, after) {
  const changed = []
  for (const f of ['event', 'expectedAction'])
    if (similarity(before[f], after[f]) < REWRITTEN) changed.push(f)
  if (overlap(before.from, after.from) < REWRITTEN) changed.push('from')
  return changed
}

/**
 * `before` and `after`: MSEL rows; `planted`: from applyDefects (their rows are exempt, the
 * critique was meant to change them); `penalty`: points lost per percent of weighted damage.
 */
export function damageScore({ before, after, planted, penalty }) {
  const exempt = new Set(planted.flatMap((d) => d.rows))
  const rows = before.filter(
    (r) => !exempt.has(r.id) && !['STARTEX', 'ENDEX'].includes(r.purposeTag),
  )
  const byId = new Map(after.map((r) => [r.id, r]))
  const damaged = []
  for (const row of rows) {
    const now = byId.get(row.id)
    const fields = now ? changedFields(row, now) : ['removed']
    if (fields.length) damaged.push({ id: row.id, tag: row.purposeTag, fields })
  }
  const total = rows.reduce((n, r) => n + rowWeight(r), 0)
  const lost = damaged.reduce((n, d) => n + rowWeight({ purposeTag: d.tag }), 0)
  const damage = total > 0 ? (lost / total) * 100 : 0
  return {
    damage: Math.round(damage * 10) / 10,
    intact: Math.max(0, Math.round((100 - damage * penalty) * 10) / 10),
    damaged,
  }
}
