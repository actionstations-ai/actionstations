// Reading the regulation triggers a project has switched on (spec 0426, generation hook).
import type { Project } from '@shared/schemas'
import { isEnabled, layeredItems } from '../compliance/registry'
import { MAX_LISTED_TRIGGERS, type TriggerChoice } from './regulation-triggers'

/** The triggers of the project's enabled regulations; empty when none or when they cannot be read. */
export async function enabledTriggers(root: string, project: Project): Promise<TriggerChoice[]> {
  try {
    const regulations = (await layeredItems(root, 'regulations'))
      .map((l) => l.item)
      .filter((r) => isEnabled(project, 'regulations', r.id))
    return regulations
      .flatMap((r) =>
        r.triggers.map((t) => ({
          regulationId: r.id,
          triggerId: t.id,
          regulation: r.label,
          label: t.label,
          hint: t.hint,
        })),
      )
      .slice(0, MAX_LISTED_TRIGGERS)
  } catch {
    return []
  }
}
