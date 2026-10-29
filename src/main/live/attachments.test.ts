import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sha256Hex, sniffImage, storeAttachment } from './attachments'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')
const BLOB_ID = 'AbCdEfGhIjKlMnOpQrSt_-'

describe('sniffImage', () => {
  it('recognizes JPEG, PNG and WebP by their first bytes', () => {
    expect(sniffImage(JPEG)).toBe('image/jpeg')
    expect(sniffImage(PNG)).toBe('image/png')
    expect(sniffImage(WEBP)).toBe('image/webp')
  })

  it('does not recognize SVG, HTML or empty input', () => {
    expect(sniffImage(SVG)).toBeUndefined()
    expect(sniffImage(new TextEncoder().encode('<html>'))).toBeUndefined()
    expect(sniffImage(new Uint8Array())).toBeUndefined()
  })
})

describe('storeAttachment', () => {
  let root: string
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'as-att-'))
  })
  afterEach(() => rm(root, { recursive: true, force: true }))

  const store = (over: Partial<Parameters<typeof storeAttachment>[0]> = {}) =>
    storeAttachment({
      sessionDir: join(root, 'scenarios', 's1', 'live', 'sess'),
      projectRoot: root,
      blobId: BLOB_ID,
      bytes: PNG,
      claimedMime: 'image/png',
      claimedSha256: sha256Hex(PNG),
      maxBytes: 1024,
      ...over,
    })

  it('writes under attachments/ with a name made from the blob id', async () => {
    const stored = await store()
    expect(stored.path).toBe(`scenarios/s1/live/sess/attachments/${BLOB_ID}.png`)
    const files = await readdir(join(root, 'scenarios', 's1', 'live', 'sess', 'attachments'))
    expect(files).toEqual([`${BLOB_ID}.png`])
  })

  it('refuses a claimed type that the bytes do not show', async () => {
    await expect(store({ bytes: SVG, claimedSha256: sha256Hex(SVG) })).rejects.toThrow(/image/)
    await expect(store({ claimedMime: 'image/jpeg' })).rejects.toThrow(/image/)
  })

  it('refuses oversize, wrong-hash and path-like ids', async () => {
    await expect(store({ maxBytes: 4 })).rejects.toThrow(/large/)
    await expect(store({ claimedSha256: 'b'.repeat(64) })).rejects.toThrow(/hash/)
    await expect(store({ blobId: '../../../etc/passwd' })).rejects.toThrow(/id/)
  })
})
