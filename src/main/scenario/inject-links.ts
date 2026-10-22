// Keep each inject's `mselRowId` in step with the MSEL row that links to it (row.injectId).
// The MSEL editor can rename or renumber row ids; the inject files must follow, or the deck,
// export and facilitator views would lose the link.
import type { Scenario } from '@shared/schemas'
import { listInjects, saveInject } from './store'

/** Returns the ids of injects whose mselRowId was updated. */
export async function syncInjectRowIds(projectPath: string, scenario: Scenario): Promise<string[]> {
  const rowByInject = new Map(
    scenario.msel.filter((r) => r.injectId).map((r) => [r.injectId as string, r.id]),
  )
  if (rowByInject.size === 0) return []
  const updated: string[] = []
  for (const inject of await listInjects(projectPath, scenario.id)) {
    const rowId = rowByInject.get(inject.id)
    if (rowId && rowId !== inject.mselRowId) {
      await saveInject(
        projectPath,
        scenario.id,
        { ...inject, mselRowId: rowId },
        {
          by: 'user',
          note: `MSEL row renamed ${inject.mselRowId} → ${rowId}`,
          snapshot: false,
        },
      )
      updated.push(inject.id)
    }
  }
  return updated
}
