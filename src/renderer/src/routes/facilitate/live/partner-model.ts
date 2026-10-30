import { rowMatchesPrefix } from '@shared/live/codec'
import type { PartnerStatus } from '@shared/schemas/live'
import type { MselRow } from '@shared/schemas/scenario'

export type RowView = Pick<MselRow, 'id' | 'event' | 'toRoleIds' | 'toLabel'>

/** The rows this organization may release: those inside the prefixes the host's roster gave it. */
export function mineOf(rows: readonly RowView[], status: PartnerStatus): RowView[] {
  const prefixes = status.scope?.rowPrefixes ?? []
  return rows.filter((r) => prefixes.some((p) => rowMatchesPrefix(r.id, p)))
}
