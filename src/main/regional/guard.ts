// A planner cannot edit rows another organization owns (spec 0440 FR-13). The MSEL editor shows
// them read-only; this is the check behind it: a user save that changes, removes or re-owns a
// partner's row is refused. Partners’ changes arrive only through a merge or a proposal.
import type { Scenario } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { diffRow, type CurrentRow } from './merge'
import { hasRegional, readRegional } from './store'

export async function assertOwnRowsOnly(
  root: string,
  scenario: Pick<Scenario, 'id' | 'msel'>,
  stored: Pick<Scenario, 'msel'>,
): Promise<void> {
  if (!(await hasRegional(root, scenario.id))) return
  const { thisOrg } = await readRegional(root, scenario.id)
  const incoming = new Map(scenario.msel.map((r) => [r.id, r]))
  for (const old of stored.msel) {
    if (!old.owner || old.owner === thisOrg) continue
    const next = incoming.get(old.id)
    const changed =
      !next ||
      next.owner !== old.owner ||
      diffRow(old as unknown as CurrentRow, next as never).length > 0
    if (changed)
      throw new AppError(
        'FORBIDDEN',
        `${old.id} belongs to ${old.owner.toUpperCase()}. Propose a change instead of editing it.`,
        { reason: 'not_owner', rowId: old.id },
      )
  }
}
