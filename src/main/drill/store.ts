// drills/<id>.json (#431, FR-8): read, list and save regression drill plans and their runs.
import { Drill, type DrillPlan, type DrillRun } from '@shared/schemas'
import { makeCollection } from '../lib/collection'
import { emit } from '../lib/events'
import { newId, nowIso } from '../lib/ids'

const drills = makeCollection('drills', Drill)

export async function listDrills(root: string): Promise<Drill[]> {
  const all = await drills.list(root)
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

export const getDrill = (root: string, id: string): Promise<Drill> => drills.get(root, id)

export async function saveDrill(root: string, drill: Drill): Promise<Drill> {
  const saved = await drills.save(root, { ...drill, updatedAt: nowIso() })
  emit('project:changed', { path: root, what: 'drills' })
  return saved
}

/** Store a drafted drill (a new id) or replace an edited one (same id, runs kept). */
export async function saveDrillPlan(
  root: string,
  input: DrillPlan & { id?: string | undefined },
): Promise<Drill> {
  const existing = input.id ? await getDrill(root, input.id).catch(() => undefined) : undefined
  if (existing) {
    // Runs and the built scenario belong to the drill, not to the edit form.
    const { id: _id, ...fields } = input
    return saveDrill(root, {
      ...existing,
      ...fields,
      runs: existing.runs,
      ...(existing.drillScenarioId ? { drillScenarioId: existing.drillScenarioId } : {}),
    })
  }
  const now = nowIso()
  const { id: _id, ...fields } = input
  return saveDrill(
    root,
    Drill.parse({ ...fields, id: newId(), runs: [], createdAt: now, updatedAt: now }),
  )
}

export async function appendRun(root: string, drillId: string, run: DrillRun): Promise<Drill> {
  const drill = await getDrill(root, drillId)
  return saveDrill(root, { ...drill, runs: [...drill.runs, run] })
}

export async function deleteDrill(root: string, id: string): Promise<void> {
  await drills.remove(root, id)
  emit('project:changed', { path: root, what: 'drills' })
}
