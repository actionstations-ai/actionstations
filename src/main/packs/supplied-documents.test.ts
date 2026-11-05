// The user's own copy of a document a library lists by hash (#1101): the size and sha256 check,
// its plain messages, and the store under userData/supplied-documents.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() } }))

const { addSuppliedDocument, checkSupplied, hasSuppliedCopy, suppliedPath } =
  await import('./supplied-documents')

const BODY = Buffer.from('%PDF-1.7\n% the pinned standard\n%%EOF\n')
const doc = {
  path: 'documents/card-standard/card-standard.pdf',
  sha256: createHash('sha256').update(BODY).digest('hex'),
  size: BODY.length,
}
const file = (bytes: Buffer): string => {
  const p = join(mkdtempSync(join(tmpdir(), 'ttx-dl-')), 'download.pdf')
  writeFileSync(p, bytes)
  return p
}

beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
})

describe('checkSupplied', () => {
  it('passes the pinned size and hash', () => {
    expect(checkSupplied(doc, { size: doc.size, sha256: doc.sha256 })).toEqual({ ok: true })
  })

  it('names the expected and the actual size on a size mismatch', () => {
    const r = checkSupplied({ sha256: doc.sha256, size: 4_458_346 }, { size: 1_200_000 })
    expect(r).toEqual({
      ok: false,
      message:
        'This is not the file the library lists. Expected 4,458,346 bytes (4.5 MB); the chosen file is 1,200,000 bytes (1.2 MB). Download the edition named here and choose that file.',
    })
  })

  it('says the contents differ when only the hash does', () => {
    const r = checkSupplied(doc, { size: doc.size, sha256: 'b'.repeat(64) })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.message).toMatch(/expected size.*contents differ \(sha256 bbbbbbbbbbbb…/)
  })
})

describe('addSuppliedDocument', () => {
  it('copies a matching file to supplied-documents/<sha256>/<file>', async () => {
    expect(hasSuppliedCopy(doc)).toBe(false)
    expect(await addSuppliedDocument(doc, file(BODY))).toEqual({ ok: true })
    expect(suppliedPath(doc)).toBe(
      join(process.env.TTX_USER_DATA!, 'supplied-documents', doc.sha256, 'card-standard.pdf'),
    )
    expect(readFileSync(suppliedPath(doc))).toEqual(BODY)
    expect(hasSuppliedCopy(doc)).toBe(true)
  })

  it('keeps nothing for a file with other contents, not even a partial copy', async () => {
    const other = Buffer.from(BODY.toString().replace('pinned', 'edited'))
    const r = await addSuppliedDocument(doc, file(other))
    expect(r.ok).toBe(false)
    expect(hasSuppliedCopy(doc)).toBe(false)
    expect(readdirSync(join(process.env.TTX_USER_DATA!, 'supplied-documents', doc.sha256))).toEqual(
      [],
    )
  })

  it('refuses a path that is not a readable file', async () => {
    const r = await addSuppliedDocument(doc, mkdtempSync(join(tmpdir(), 'ttx-dir-')))
    expect(r).toEqual({ ok: false, message: 'That is not a file that can be read.' })
    expect(existsSync(join(process.env.TTX_USER_DATA!, 'supplied-documents'))).toBe(false)
  })
})
