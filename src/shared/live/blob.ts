/**
 * Blobs: one AES-GCM message per blob under a key derived from the epoch root, chunked only
 * for transport. The receiver reassembles in any order, verifies the tag, then the sha256.
 */
import { bytesEqual, fromBase64Url, toBase64Url, toHex, utf8 } from './bytes'
import type { SessionKeys } from './crypto/keys'
import { keyName, parseKeyName } from './crypto/keys'
import type { CryptoProvider } from './crypto/provider'
import { HKDF_INFO, NONCE_BYTES, type KeyKind, type Limits } from './protocol'
import { BlobRef, type BlobMeta, type RelayBlobPut } from './schemas'

export type Uploader = 'controller' | 'player'

export class BlobError extends Error {
  constructor(
    readonly code:
      | 'BLOB_TOO_LARGE'
      | 'BAD_TAG'
      | 'SHA_MISMATCH'
      | 'INCOMPLETE'
      | 'UNKNOWN_EPOCH'
      | 'STAFF_ONLY'
      | 'BAD_CHUNK',
    message: string,
  ) {
    super(message)
    this.name = 'BlobError'
  }
}

export function blobCap(limits: Limits, uploader: Uploader): number {
  return uploader === 'controller' ? limits.blobBytes : limits.playerBlobBytes
}

/** Refuses before any work when the plaintext is over the connection's cap for this uploader. */
export function assertBlobSize(limits: Limits, uploader: Uploader, bytes: number): void {
  const cap = blobCap(limits, uploader)
  if (bytes > cap) {
    throw new BlobError('BLOB_TOO_LARGE', `Blob of ${bytes} bytes is over the ${cap}-byte cap`)
  }
}

async function blobKey(
  crypto: CryptoProvider,
  keys: SessionKeys,
  k: string,
  blobId: string,
): Promise<Uint8Array> {
  const parsed = parseKeyName(k)
  if (!parsed) throw new BlobError('UNKNOWN_EPOCH', `Bad key name ${k}`)
  const root = keys.root(parsed.kind, parsed.epoch)
  if (!root) {
    const reason = parsed.kind === 'staff' && !keys.hasStaff ? 'STAFF_ONLY' : 'UNKNOWN_EPOCH'
    throw new BlobError(reason, `No ${parsed.kind} key for epoch ${parsed.epoch}`)
  }
  return crypto.hkdf(root, HKDF_INFO.blob(blobId), 32)
}

export interface SealBlobOptions {
  key?: KeyKind
  limits: Limits
  uploader: Uploader
  epoch?: number
  blobId?: string
}

export async function sealBlob(
  crypto: CryptoProvider,
  keys: SessionKeys,
  meta: BlobMeta,
  plaintext: Uint8Array,
  opts: SealBlobOptions,
): Promise<{ ref: BlobRef; sealed: Uint8Array }> {
  assertBlobSize(opts.limits, opts.uploader, plaintext.length)
  const kind = opts.key ?? 'players'
  const epoch = opts.epoch ?? keys.currentEpoch
  if (kind === 'staff' && !keys.root('staff', epoch))
    throw new Error('This client holds no staff key')
  const blobId = opts.blobId ?? toBase64Url(crypto.random(16))
  const k = keyName(kind, epoch)
  const key = await blobKey(crypto, keys, k, blobId)
  const nonce = crypto.random(NONCE_BYTES)
  const sealed = await crypto.aesGcmSeal(key, nonce, utf8(HKDF_INFO.blob(blobId)), plaintext)
  const ref = BlobRef.parse({
    ...meta,
    blobId,
    bytes: plaintext.length,
    sha256: toHex(await crypto.sha256(plaintext)),
    k,
    n: toBase64Url(nonce),
  })
  return { ref, sealed }
}

/** Verifies the tag, then the sha256, then returns the plaintext. */
export async function openBlob(
  crypto: CryptoProvider,
  keys: SessionKeys,
  ref: BlobRef,
  sealed: Uint8Array,
): Promise<Uint8Array> {
  const key = await blobKey(crypto, keys, ref.k, ref.blobId)
  let plaintext: Uint8Array
  try {
    plaintext = await crypto.aesGcmOpen(
      key,
      fromBase64Url(ref.n),
      utf8(HKDF_INFO.blob(ref.blobId)),
      sealed,
    )
  } catch {
    throw new BlobError('BAD_TAG', 'Blob failed to open')
  }
  if (plaintext.length !== ref.bytes || toHex(await crypto.sha256(plaintext)) !== ref.sha256) {
    throw new BlobError('SHA_MISMATCH', 'Blob content does not match its reference')
  }
  return plaintext
}

/** Split sealed bytes into `relay.blob.put` payloads of at most `chunkBytes` each. */
export function chunkBlob(blobId: string, sealed: Uint8Array, chunkBytes: number): RelayBlobPut[] {
  if (chunkBytes < 1) throw new Error('chunkBytes must be positive')
  const count = Math.max(1, Math.ceil(sealed.length / chunkBytes))
  const chunks: RelayBlobPut[] = []
  for (let index = 0; index < count; index++) {
    const slice = sealed.subarray(index * chunkBytes, (index + 1) * chunkBytes)
    chunks.push({ blobId, index, count, bytes: toBase64Url(slice) })
  }
  return chunks
}

/**
 * Collects chunks in any order; `complete` once every index arrived. Bounded by the sealed
 * size the `BlobRef` announced (`bytes + 16`) and the connection's chunk size, so a hostile
 * server cannot make a device buffer more than it asked for.
 */
export class BlobAssembler {
  private readonly parts = new Map<number, Uint8Array>()
  private count: number | undefined
  received = 0
  /** Most chunks a blob of this size can have at this chunk size. */
  readonly maxCount: number

  constructor(
    readonly blobId: string,
    /** Sealed size: the reference's `bytes` plus the 16-byte tag. */
    readonly sealedBytes: number,
    chunkBytes: number,
  ) {
    if (sealedBytes < 16 || chunkBytes < 1) throw new BlobError('BAD_CHUNK', 'Bad blob bounds')
    this.maxCount = Math.max(1, Math.ceil(sealedBytes / chunkBytes))
  }

  /** Sealed size for a reference. */
  static sealedSize(ref: { bytes: number }): number {
    return ref.bytes + 16
  }

  add(chunk: RelayBlobPut): boolean {
    if (chunk.blobId !== this.blobId) throw new BlobError('BAD_CHUNK', 'Chunk of another blob')
    if (this.count !== undefined && chunk.count !== this.count) {
      throw new BlobError('BAD_CHUNK', 'Chunk count changed')
    }
    if (chunk.count > this.maxCount) {
      throw new BlobError('BAD_CHUNK', 'More chunks than the blob can have')
    }
    if (chunk.index >= chunk.count) throw new BlobError('BAD_CHUNK', 'Chunk index out of range')
    this.count = chunk.count
    const bytes = fromBase64Url(chunk.bytes)
    const existing = this.parts.get(chunk.index)
    if (existing) {
      if (!bytesEqual(existing, bytes)) {
        throw new BlobError('BAD_CHUNK', 'Conflicting duplicate chunk')
      }
      return this.complete
    }
    if (this.received + bytes.length > this.sealedBytes) {
      throw new BlobError('BAD_CHUNK', 'More bytes than the blob announced')
    }
    this.parts.set(chunk.index, bytes)
    this.received += bytes.length
    return this.complete
  }

  get complete(): boolean {
    return this.count !== undefined && this.parts.size === this.count
  }

  bytes(): Uint8Array {
    if (!this.complete) throw new BlobError('INCOMPLETE', 'Not every chunk arrived')
    if (this.received !== this.sealedBytes) {
      throw new BlobError('BAD_CHUNK', 'Blob size differs from its reference')
    }
    const out = new Uint8Array(this.received)
    let o = 0
    for (let i = 0; i < this.count!; i++) {
      const part = this.parts.get(i)!
      out.set(part, o)
      o += part.length
    }
    return out
  }
}
