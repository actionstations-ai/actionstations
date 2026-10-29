/**
 * Images players attach to messages (spec 0413 Security): the bytes decide the type, never the
 * claimed mime; only JPEG, PNG and WebP are kept; the file name is chosen here from the blob
 * id, never taken from the device; files live under the session folder's `attachments/`.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { relative } from 'node:path'
import { AppError } from '../lib/errors'
import { safeJoin } from '../lib/fs'

export type AttachmentMime = 'image/jpeg' | 'image/png' | 'image/webp'

const EXTENSIONS: Record<AttachmentMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const BLOB_ID = /^[A-Za-z0-9_-]{22}$/

const startsWith = (b: Uint8Array, sig: number[], at = 0): boolean =>
  sig.every((byte, i) => b[at + i] === byte)

/** The image type the leading bytes show, or undefined for anything else (SVG, HTML, ...). */
export function sniffImage(bytes: Uint8Array): AttachmentMime | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return 'image/webp'
  return undefined
}

export const sha256Hex = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

export interface StoredAttachment {
  mime: AttachmentMime
  sha256: string
  /** Project-relative, forward slashes. */
  path: string
}

/**
 * Check and write one attachment. Throws when the bytes are not an allowed image, are over
 * `maxBytes`, or do not match the sha-256 the sender declared.
 */
export async function storeAttachment(opts: {
  sessionDir: string
  projectRoot: string
  blobId: string
  bytes: Uint8Array
  claimedMime: string
  claimedSha256: string
  maxBytes: number
}): Promise<StoredAttachment> {
  const { bytes, blobId } = opts
  if (!BLOB_ID.test(blobId)) throw new AppError('VALIDATION', 'Attachment id is not valid')
  if (bytes.length === 0 || bytes.length > opts.maxBytes)
    throw new AppError('VALIDATION', 'Attachment is empty or too large')
  const mime = sniffImage(bytes)
  if (!mime || mime !== opts.claimedMime)
    throw new AppError('VALIDATION', 'Attachment is not a JPEG, PNG or WebP image')
  const sha256 = sha256Hex(bytes)
  if (sha256 !== opts.claimedSha256) throw new AppError('VALIDATION', 'Attachment hash differs')
  const file = safeJoin(opts.sessionDir, 'attachments', `${blobId}.${EXTENSIONS[mime]}`)
  await fs.mkdir(safeJoin(opts.sessionDir, 'attachments'), { recursive: true })
  await fs.writeFile(file, bytes)
  return { mime, sha256, path: relative(opts.projectRoot, file).split('\\').join('/') }
}
