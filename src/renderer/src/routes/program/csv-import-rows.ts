import type { CsvImportPreview } from '@shared/ipc'

/** How many rows will be created, skipped as already present, and refused. */
export function tallyRows(rows: CsvImportPreview['rows']) {
  const refused = rows.filter((r) => r.error).length
  const duplicates = rows.filter((r) => !r.error && r.duplicate).length
  return { create: rows.length - refused - duplicates, duplicates, refused }
}
