// micro-drills/<id>.json, micro-drill-runs/<id>.json and micro-drill-hints.json (#437): drills,
// their runs, and what each participant label needed. All files are optional, written
// atomically and ignored by older versions of the app (ADR-0016).
import { MicroDrill, MicroDrillHintHistory, MicroDrillRun } from '@shared/schemas'
import type { AnnexHistory } from './hints'
import { makeCollection } from '../lib/collection'
import { emit } from '../lib/events'
import { readJsonOr, safeJoin, writeJsonAtomic } from '../lib/fs'
import { nowIso } from '../lib/ids'
import { AppError } from '../lib/errors'

const drills = makeCollection('micro-drills', MicroDrill)
const runs = makeCollection('micro-drill-runs', MicroDrillRun)

const changed = (root: string): void =>
  emit('project:changed', { path: root, what: 'micro-drills' })

export async function listMicroDrills(root: string): Promise<MicroDrill[]> {
  const all = await drills.list(root)
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

export const getMicroDrill = (root: string, id: string): Promise<MicroDrill> => drills.get(root, id)

export async function saveMicroDrill(root: string, drill: MicroDrill): Promise<MicroDrill> {
  const saved = await drills.save(root, { ...drill, updatedAt: nowIso() })
  changed(root)
  return saved
}

export async function deleteMicroDrill(root: string, id: string): Promise<void> {
  await drills.remove(root, id)
  for (const run of await listMicroRuns(root, id)) await runs.remove(root, run.id)
  changed(root)
}

export async function listMicroRuns(root: string, drillId?: string): Promise<MicroDrillRun[]> {
  const all = await runs.list(root)
  return all
    .filter((r) => !drillId || r.drillId === drillId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.id.localeCompare(b.id))
}

export const getMicroRun = (root: string, id: string): Promise<MicroDrillRun> => runs.get(root, id)

export async function saveMicroRun(root: string, run: MicroDrillRun): Promise<MicroDrillRun> {
  const saved = await runs.save(root, run)
  changed(root)
  return saved
}

/** Take participant names off every run of a drill; labels and results stay (Security section). */
export async function removeNames(root: string, drillId: string): Promise<number> {
  let removed = 0
  for (const run of await listMicroRuns(root, drillId)) {
    const named = run.participants.filter((p) => p.name)
    if (!named.length) continue
    removed += named.length
    await saveMicroRun(root, {
      ...run,
      participants: run.participants.map(({ label }) => ({ label })),
    })
  }
  return removed
}

const historyFile = (root: string): string => safeJoin(root, 'micro-drill-hints.json')

/** The annex a history belongs to: document and heading, so drills on the same annex share it. */
export const annexKey = (annex: { documentId: string; headingPath: string }): string =>
  `${annex.documentId}|${annex.headingPath}`

async function readAll(root: string): Promise<MicroDrillHintHistory> {
  return readJsonOr(historyFile(root), MicroDrillHintHistory, () => ({}))
}

export async function readHistory(
  root: string,
  annex: { documentId: string; headingPath: string },
): Promise<AnnexHistory> {
  return (await readAll(root))[annexKey(annex)] ?? {}
}

export async function writeHistory(
  root: string,
  annex: { documentId: string; headingPath: string },
  history: AnnexHistory,
): Promise<void> {
  const all = await readAll(root)
  const parsed = MicroDrillHintHistory.safeParse({ ...all, [annexKey(annex)]: history })
  if (!parsed.success) throw new AppError('VALIDATION', 'The hint history is not valid')
  await writeJsonAtomic(historyFile(root), parsed.data)
}
