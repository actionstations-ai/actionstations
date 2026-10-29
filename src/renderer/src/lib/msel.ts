// MSEL view helpers shared by screens that list rows (facilitator timeline, deck views).
import type { Role } from '@shared/schemas/project'
import { recipients } from '@shared/facilitator/recipients'
import type { MselRow, Phase } from '@shared/schemas/scenario'

export interface PhaseGroup {
  phase: Phase | null
  rows: MselRow[]
}

/** Rows grouped under their phase, phases in index order; orphan rows go last. */
export function groupByPhase(phases: Phase[], rows: MselRow[]): PhaseGroup[] {
  const sorted = [...phases].sort((a, b) => a.index - b.index)
  const groups: PhaseGroup[] = sorted.map((phase) => ({
    phase,
    rows: rows.filter((r) => r.phaseId === phase.id),
  }))
  const known = new Set(phases.map((p) => p.id))
  const orphans = rows.filter((r) => !known.has(r.phaseId))
  if (orphans.length) groups.push({ phase: null, rows: orphans })
  return groups
}

export function toLabel(row: MselRow, roles: Role[]): string {
  return recipients(row, roles).label
}
