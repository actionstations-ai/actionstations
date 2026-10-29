// Snapshots on disk (spec 0439 FR-13 to FR-15): hazards/index.json and hazards/<id>.json inside
// the project folder. Plain data, so a project copied to an air-gapped computer keeps working.
// At most 10 snapshots are kept; pinned and active ones are never dropped to make room.
import { promises as fs } from 'node:fs'
import { HazardIndex, HazardSnapshot, type HazardIndexEntry } from '@shared/schemas'
import { SafeId } from '@shared/schemas/common'
import { AppError } from '../lib/errors'
import { ensureDir, readJson, readJsonOr, safeJoin, writeJsonAtomic } from '../lib/fs'

export const MAX_SNAPSHOTS = 10

const dir = (root: string): string => safeJoin(root, 'hazards')
const indexFile = (root: string): string => safeJoin(root, 'hazards', 'index.json')

function snapshotFile(root: string, id: string): string {
  if (!SafeId.safeParse(id).success) throw new AppError('VALIDATION', 'Invalid snapshot id')
  return safeJoin(root, 'hazards', `${id}.json`)
}

export const entryOf = (s: HazardSnapshot): HazardIndexEntry => ({
  id: s.id,
  label: s.label,
  fetchedAt: s.fetchedAt,
  pinned: s.pinned,
})

export function readIndex(root: string): Promise<HazardIndex> {
  return readJsonOr(indexFile(root), HazardIndex, () => ({ snapshots: [] }))
}

export async function getSnapshot(root: string, id: string): Promise<HazardSnapshot> {
  const file = snapshotFile(root, id)
  try {
    return await readJson(file, HazardSnapshot)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT')
      throw new AppError('NOT_FOUND', 'That hazard snapshot is gone')
    throw err
  }
}

/** The snapshot marked active, or undefined when there is none. */
export async function activeSnapshot(root: string): Promise<HazardSnapshot | undefined> {
  const { active } = await readIndex(root)
  if (!active) return undefined
  return getSnapshot(root, active).catch(() => undefined)
}

/** Whether another snapshot can be added: an unpinned, non-active one is dropped to make room. */
export function roomFor(index: HazardIndex): boolean {
  return (
    index.snapshots.length < MAX_SNAPSHOTS ||
    index.snapshots.some((s) => !s.pinned && s.id !== index.active)
  )
}

export function assertRoom(index: HazardIndex): void {
  if (!roomFor(index))
    throw new AppError(
      'CONFLICT',
      `This project already keeps ${MAX_SNAPSHOTS} pinned snapshots. Unpin or delete one first.`,
    )
}

async function removeFile(root: string, id: string): Promise<void> {
  await fs.rm(snapshotFile(root, id), { force: true })
}

/** Write a snapshot, make it active, and drop the oldest unpinned ones over the limit. */
export async function saveNewSnapshot(root: string, snapshot: HazardSnapshot): Promise<void> {
  await ensureDir(dir(root))
  const index = await readIndex(root)
  assertRoom(index)
  await writeJsonAtomic(snapshotFile(root, snapshot.id), snapshot)
  const all = [entryOf(snapshot), ...index.snapshots.filter((s) => s.id !== snapshot.id)]
  const kept = [...all]
  while (kept.length > MAX_SNAPSHOTS) {
    const at = kept.findLastIndex((s) => !s.pinned && s.id !== snapshot.id)
    if (at < 0) break
    const [gone] = kept.splice(at, 1)
    await removeFile(root, gone!.id)
  }
  await writeJsonAtomic(indexFile(root), { active: snapshot.id, snapshots: kept })
}

/** Rewrite a snapshot in place (a layer import) and refresh its index entry. */
export async function rewriteSnapshot(root: string, snapshot: HazardSnapshot): Promise<void> {
  await writeJsonAtomic(snapshotFile(root, snapshot.id), snapshot)
  const index = await readIndex(root)
  await writeJsonAtomic(indexFile(root), {
    ...index,
    snapshots: index.snapshots.map((s) => (s.id === snapshot.id ? entryOf(snapshot) : s)),
  })
}

export interface SnapshotUpdate {
  label?: string
  pinned?: boolean
  /** true makes it the active snapshot; false clears it when it is the active one. */
  active?: boolean
}

export async function updateSnapshot(
  root: string,
  id: string,
  patch: SnapshotUpdate,
): Promise<HazardIndex> {
  const snapshot = await getSnapshot(root, id)
  if (patch.label !== undefined) snapshot.label = patch.label
  if (patch.pinned !== undefined) snapshot.pinned = patch.pinned
  await rewriteSnapshot(root, snapshot)
  const index = await readIndex(root)
  const active =
    patch.active === true
      ? id
      : patch.active === false && index.active === id
        ? undefined
        : index.active
  const next = { ...index, ...(active ? { active } : {}) }
  if (!active) delete next.active
  await writeJsonAtomic(indexFile(root), next)
  return next
}

export async function deleteSnapshot(root: string, id: string): Promise<HazardIndex> {
  const index = await readIndex(root)
  await removeFile(root, id)
  const next: HazardIndex = {
    snapshots: index.snapshots.filter((s) => s.id !== id),
    ...(index.active && index.active !== id ? { active: index.active } : {}),
  }
  await writeJsonAtomic(indexFile(root), next)
  return next
}
