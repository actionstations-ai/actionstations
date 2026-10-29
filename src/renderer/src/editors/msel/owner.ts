// Regional exercises (#440, #497): rows another organization owns are shown with an owner badge
// and are read-only here. The main process refuses a save that touches one; this keeps the
// editor from offering the change.
import type { MselRow } from '@shared/schemas/scenario'

/** This project's organization and the exercise's organizations, for owner badges. */
export interface RegionalView {
  thisOrg: string
  /** orgId to short prefix and full name. */
  orgs: ReadonlyMap<string, { prefix: string; name: string }>
}

export const isPartnerRow = (row: Pick<MselRow, 'owner'>, regional?: RegionalView): boolean =>
  !!regional && !!row.owner && row.owner !== regional.thisOrg

/** The badge text for a partner-owned row: its owner's prefix and full name. */
export function ownerLabel(
  row: Pick<MselRow, 'owner'>,
  regional: RegionalView,
): { short: string; full: string } {
  const id = row.owner ?? ''
  const org = regional.orgs.get(id)
  return { short: org?.prefix ?? id.toUpperCase(), full: org?.name ?? id }
}
