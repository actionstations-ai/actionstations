// SitMan module list helpers (#420), kept apart from the editor component.
import type { Phase, SitMan, SitManModule } from '@shared/schemas/scenario'

/** Replace (or add) one phase's module, keeping modules in phase order. */
export function withModule(sitman: SitMan, phases: Phase[], next: SitManModule): SitMan {
  const order = new Map(phases.map((p) => [p.id, p.index]))
  const others = sitman.modules.filter((m) => m.phaseId !== next.phaseId)
  const modules = [...others, next].sort(
    (a, b) => (order.get(a.phaseId) ?? 99) - (order.get(b.phaseId) ?? 99),
  )
  return { ...sitman, modules }
}
