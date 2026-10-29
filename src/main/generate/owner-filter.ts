// Regional exercises (#440, #497): generation never changes a row another organization owns.
// A partner's rows may be read as context, but a stage, a repair pass or a critique revision
// that rewrote, re-timed, re-owned or dropped one has that undone before the step is saved.
import type { MselRow, Scenario } from '@shared/schemas'
import { hasRegional, readRegional } from '../regional/store'
import { sortMsel } from './mappers-structure'

/** The organization this project belongs to; rows owned by any other organization are fixed. */
export interface OwnerFilter {
  thisOrg: string
}

export const isPartnerRow = (row: Pick<MselRow, 'owner'>, filter?: OwnerFilter): boolean =>
  !!filter && !!row.owner && row.owner !== filter.thisOrg

/** The filter for a scenario in a regional exercise; undefined for an ordinary scenario. */
export async function loadOwnerFilter(
  root: string,
  scenarioId: string,
): Promise<OwnerFilter | undefined> {
  if (!(await hasRegional(root, scenarioId))) return undefined
  const { thisOrg } = await readRegional(root, scenarioId)
  return { thisOrg }
}

/**
 * Put every partner row back exactly as `before` had it: changed rows are replaced, dropped rows
 * return, and a partner-owned row the step invented is removed. Returns the ids it had to undo.
 */
export function restorePartnerRows(
  s: Scenario,
  before: readonly MselRow[],
  filter: OwnerFilter | undefined,
): string[] {
  if (!filter) return []
  const originals = new Map(before.filter((r) => isPartnerRow(r, filter)).map((r) => [r.id, r]))
  const undone = new Set<string>()
  const kept: MselRow[] = []
  for (const row of s.msel) {
    const original = originals.get(row.id)
    if (original) {
      if (JSON.stringify(original) !== JSON.stringify(row)) undone.add(row.id)
    } else if (isPartnerRow(row, filter)) undone.add(row.id)
    else kept.push(row)
  }
  const live = new Set(s.msel.map((r) => r.id))
  for (const id of originals.keys()) if (!live.has(id)) undone.add(id)
  s.msel = [...kept, ...[...originals.values()].map((r) => structuredClone(r))]
  sortMsel(s)
  return [...undone]
}
