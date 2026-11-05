// education-records/<id>.json (spec 0452 FR-13, FR-16): that each cornerstone of a simulation
// session was done and by whom, and the hours. Optional files, atomic writes, ignored by older
// versions (ADR-0016).
import { EducationRecord, type Cornerstone } from '@shared/schemas'
import { makeCollection } from '../lib/collection'
import { emit } from '../lib/events'
import { AppError } from '../lib/errors'
import { nowIso } from '../lib/ids'

const records = makeCollection('education-records', EducationRecord)
const changed = (root: string): void =>
  emit('project:changed', { path: root, what: 'case-studies' })

export const listEducationRecords = async (root: string): Promise<EducationRecord[]> =>
  (await records.list(root)).sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  )

export async function saveEducationRecord(
  root: string,
  r: EducationRecord,
): Promise<EducationRecord> {
  const saved = await records.save(root, { ...r, updatedAt: nowIso() })
  changed(root)
  return saved
}

export async function deleteEducationRecord(root: string, id: string): Promise<void> {
  await records.remove(root, id)
  changed(root)
}

/**
 * Record that a cornerstone was done (or take the record back) and by whom. Saying it was done
 * needs a name: the record is only worth keeping if it says who did it.
 */
export async function markCornerstone(
  root: string,
  id: string,
  cornerstone: Cornerstone,
  change: { done: boolean; by?: string; note?: string },
): Promise<EducationRecord> {
  const r = await records.get(root, id)
  if (change.done && !change.by?.trim())
    throw new AppError('VALIDATION', 'Say who did it: a record without a name is not kept')
  const entry = change.done
    ? {
        done: true,
        by: change.by!.trim(),
        at: nowIso(),
        ...(change.note?.trim() ? { note: change.note.trim() } : {}),
      }
    : { done: false }
  return saveEducationRecord(root, {
    ...r,
    cornerstones: { ...r.cornerstones, [cornerstone]: entry },
  })
}
