// Roster import (#718, FR-1): a CSV with a display name and optionally an institution student
// identifier and an email. The file is untrusted: size and row caps, unknown columns are
// discarded, over-long cells are refused, and a row whose identifier is already on the roster
// is skipped, so importing the same file twice changes nothing.
import { CLASSROOM_LIMITS, type Student } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { csvRecords } from '../hazards/sources/csv'

export const ROSTER_CSV_LIMITS = { bytes: 500_000, rows: CLASSROOM_LIMITS.students } as const

const NAME_HEADERS = ['name', 'display name', 'student', 'student name']
const ID_HEADERS = ['id', 'student id', 'student identifier', 'identifier', 'institution id']
const EMAIL_HEADERS = ['email', 'e-mail', 'email address']

export interface RosterRow {
  name: string
  institutionId?: string
  email?: string
}

export interface RosterPreview {
  rows: RosterRow[]
  /** Rows skipped, each with a plain reason. */
  skipped: Array<{ line: number; reason: string }>
  /** Header names found in the file that the import ignores. */
  ignoredColumns: string[]
}

const pick = (rec: Record<string, string>, names: string[]): string =>
  names.map((n) => rec[n]).find((v) => v !== undefined && v !== '') ?? ''

function problemWith(row: RosterRow): string | null {
  if (!row.name) return 'No name'
  if (row.name.length > CLASSROOM_LIMITS.name) return 'Name is too long'
  if ((row.institutionId?.length ?? 0) > CLASSROOM_LIMITS.identifier)
    return 'Identifier is too long'
  if ((row.email?.length ?? 0) > CLASSROOM_LIMITS.email) return 'Email is too long'
  if (row.email && !/^[^\s@]+@[^\s@]+$/.test(row.email)) return 'Email is not valid'
  return null
}

function rowOf(rec: Record<string, string>): RosterRow {
  const row: RosterRow = { name: pick(rec, NAME_HEADERS) }
  const institutionId = pick(rec, ID_HEADERS)
  const email = pick(rec, EMAIL_HEADERS)
  if (institutionId) row.institutionId = institutionId
  if (email) row.email = email
  return row
}

/** Parse and validate; `existing` are the students already on the roster (for duplicate ids). */
export function previewRoster(
  csv: string,
  existing: Pick<Student, 'institutionId'>[],
): RosterPreview {
  if (Buffer.byteLength(csv) > ROSTER_CSV_LIMITS.bytes)
    throw new AppError('VALIDATION', 'The roster file is too large (500 KB at most).')
  const records = csvRecords(csv)
  if (records.length > ROSTER_CSV_LIMITS.rows)
    throw new AppError('VALIDATION', `A roster holds up to ${ROSTER_CSV_LIMITS.rows} students.`)
  const columns = Object.keys(records[0] ?? {})
  if (records.length > 0 && !columns.some((c) => NAME_HEADERS.includes(c)))
    throw new AppError('VALIDATION', 'The file needs a "name" column.')
  const used = new Set([...NAME_HEADERS, ...ID_HEADERS, ...EMAIL_HEADERS])
  const known = new Set(existing.map((s) => s.institutionId).filter(Boolean))
  const preview: RosterPreview = {
    rows: [],
    skipped: [],
    ignoredColumns: columns.filter((c) => !used.has(c)),
  }
  records.forEach((rec, i) => {
    const row = rowOf(rec)
    const reason =
      problemWith(row) ??
      (row.institutionId && known.has(row.institutionId) ? 'Already on the roster' : null)
    if (reason) {
      preview.skipped.push({ line: i + 2, reason })
      return
    }
    if (row.institutionId) known.add(row.institutionId)
    preview.rows.push(row)
  })
  return preview
}
