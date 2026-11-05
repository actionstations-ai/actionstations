// User-supplied reference documents (#1101): a library pack lists some documents by sha256 and
// size only (pack.json userDocuments[]), because their publishers' terms do not allow passing
// them on. Each user downloads their own copy from the publisher and adds it here. The file is
// copied into userData/supplied-documents/<sha256>/<file> only when its size and sha256 match
// the pinned ones; from then on "Add from pack" offers it like any of the pack's documents, and
// every library that lists the same hash finds the same copy. Nothing is uploaded or shared.
import { promises as fs, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { PackUserDocument } from '@shared/schemas/pack'
import { userDataPath } from '../lib/paths'
import { sha256File } from '../ingest/storage'

type Pinned = Pick<PackUserDocument, 'path' | 'sha256' | 'size'>

export const suppliedDocumentsDir = (): string => userDataPath('supplied-documents')

/** userData/supplied-documents/<sha256>/<file name of the pack path>. */
export const suppliedPath = (d: Pick<PackUserDocument, 'path' | 'sha256'>): string =>
  join(suppliedDocumentsDir(), d.sha256, basename(d.path))

/** The user has added their copy of this document on this computer. */
export const hasSuppliedCopy = (d: Pick<PackUserDocument, 'path' | 'sha256'>): boolean =>
  existsSync(suppliedPath(d))

export type SupplyResult = { ok: true } | { ok: false; message: string }

const bytes = (n: number): string =>
  `${n.toLocaleString('en-US')} bytes${n >= 100_000 ? ` (${(n / 1_000_000).toFixed(1)} MB)` : ''}`

/** Whether a file's size and sha256 are the pinned ones, with a plain reason when not. */
export function checkSupplied(
  expected: Pick<PackUserDocument, 'sha256' | 'size'>,
  actual: { size: number; sha256?: string },
): SupplyResult {
  if (actual.size !== expected.size)
    return {
      ok: false,
      message: `This is not the file the library lists. Expected ${bytes(expected.size)}; the chosen file is ${bytes(actual.size)}. Download the edition named here and choose that file.`,
    }
  if (actual.sha256 !== undefined && actual.sha256 !== expected.sha256)
    return {
      ok: false,
      message: `This is not the file the library lists. It is the expected size, ${bytes(expected.size)}, but its contents differ (sha256 ${actual.sha256.slice(0, 12)}…, expected ${expected.sha256.slice(0, 12)}…): another edition or a damaged download. Download it again and choose that file.`,
    }
  return { ok: true }
}

/**
 * Copy the chosen file into the store if it is the pinned document. The copy is hashed, not the
 * original, so what is kept is exactly what was checked.
 */
export async function addSuppliedDocument(doc: Pinned, filePath: string): Promise<SupplyResult> {
  const st = await fs.stat(filePath).catch(() => undefined)
  if (!st?.isFile()) return { ok: false, message: 'That is not a file that can be read.' }
  const sized = checkSupplied(doc, { size: st.size })
  if (!sized.ok) return sized
  const target = suppliedPath(doc)
  await fs.mkdir(join(suppliedDocumentsDir(), doc.sha256), { recursive: true })
  const tmp = `${target}.${process.pid}.part`
  try {
    await fs.copyFile(filePath, tmp)
    const actual = { size: (await fs.stat(tmp)).size, sha256: await sha256File(tmp) }
    const checked = checkSupplied(doc, actual)
    if (!checked.ok) return checked
    await fs.rename(tmp, target)
    return { ok: true }
  } finally {
    await fs.rm(tmp, { force: true })
  }
}
