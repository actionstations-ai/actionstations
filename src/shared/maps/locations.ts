// Which MSEL rows happen at which place (#500). Shared by the export Locations pages and the
// device map so both read a row's places the same way.

/** At most this many markers on one Locations page. */
export const MAX_MARKERS_PER_PAGE = 12

/** Place id → ids of the rows that name it, in MSEL order. */
export function rowsByPlace(
  rows: readonly { id: string; placeIds?: readonly string[] | undefined }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const row of rows)
    for (const placeId of row.placeIds ?? []) {
      const list = out.get(placeId) ?? []
      list.push(row.id)
      out.set(placeId, list)
    }
  return out
}
