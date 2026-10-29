/**
 * What a session server persists, behind one synchronous interface: envelopes with their
 * arrival index, per-sender `seq`, client identities (resume-token hashes), blob chunks and the
 * session's metadata. Three backends implement it: `MemoryStore` here, SQLite in a Durable
 * Object (relay/cloudflare) and `node:sqlite` (relay/node). Everything stored is ciphertext or
 * metadata; the store never sees a key.
 *
 * Synchronous on purpose: every backend is (Durable Object `sql.exec`, `node:sqlite`, a Map),
 * and it keeps the hub's per-frame processing atomic, so two frames from one connection cannot
 * interleave between the `seq` check and the append.
 */
import type { MessageType } from '@shared/live/protocol'
import type { ClientId } from '@shared/live/schemas/envelope'

export interface SessionMeta {
  sessionId: string
  createdAt: number
  /** When the retention alarm deletes everything, whatever the controller did. */
  expiresAt: number
  /** Empty until the app sets one: no participant can connect before. */
  joinTokenHash: string
  /** One per controller connection allowed: the host's, then co-controllers' (#440). */
  controllerTokenHashes: string[]
  /** Set by `session.end`; the content is gone and only this tombstone remains for an hour. */
  endedAt?: number
}

export type StoredIdentity = { kind: 'controller' } | { kind: 'participant'; resumeHash: string }

export interface StoredFrame {
  /** Arrival index, 1-based and contiguous per session. */
  index: number
  from: ClientId
  to: string
  type: MessageType
  frame: string
}

export type StoredFrameInput = Omit<StoredFrame, 'index'>

export interface BlobRecord {
  blobId: string
  uploader: ClientId
  count: number
  /** Chunks received so far (distinct indexes). */
  received: number
  /** Sealed bytes received so far. */
  bytes: number
  done: boolean
}

export interface StoredChunk {
  index: number
  /** base64url of the sealed chunk, exactly as the uploader sent it. */
  bytes: string
}

export interface SessionStore {
  meta(): SessionMeta | undefined
  setMeta(meta: SessionMeta): void

  /** Appends and returns the arrival index. */
  append(frame: StoredFrameInput): number
  /** Frames with index in (`after`, `after + limit`], in index order. */
  readAfter(after: number, limit: number): StoredFrame[]
  count(): number
  lastIndex(): number

  lastSeq(client: ClientId): number
  setLastSeq(client: ClientId, seq: number): void

  identity(client: ClientId): StoredIdentity | undefined
  setIdentity(client: ClientId, identity: StoredIdentity): void

  blob(blobId: string): BlobRecord | undefined
  /**
   * Stores one chunk, creating the blob record on the first. A chunk index already stored is
   * ignored. Returns the record after the write.
   */
  putChunk(
    blobId: string,
    uploader: ClientId,
    count: number,
    index: number,
    bytes: string,
    byteLength: number,
  ): BlobRecord
  hasChunk(blobId: string, index: number): boolean
  chunks(blobId: string): Iterable<StoredChunk>
  deleteBlob(blobId: string): void
  /** Sealed bytes of every blob in the session, complete or not. */
  blobBytes(): number

  /** Frames, seqs, identities and blobs go; the metadata stays as the tombstone. */
  deleteContent(): void
  /** Everything goes, metadata included. */
  deleteAll(): void
}

interface MemoryBlob extends BlobRecord {
  chunkMap: Map<number, string>
}

export class MemoryStore implements SessionStore {
  private metaRow: SessionMeta | undefined
  private frames: StoredFrame[] = []
  private readonly seqs = new Map<ClientId, number>()
  private readonly identities = new Map<ClientId, StoredIdentity>()
  private readonly blobs = new Map<string, MemoryBlob>()

  meta(): SessionMeta | undefined {
    if (!this.metaRow) return undefined
    return { ...this.metaRow, controllerTokenHashes: [...this.metaRow.controllerTokenHashes] }
  }

  setMeta(meta: SessionMeta): void {
    this.metaRow = { ...meta, controllerTokenHashes: [...meta.controllerTokenHashes] }
  }

  append(frame: StoredFrameInput): number {
    const index = this.frames.length + 1
    this.frames.push({ ...frame, index })
    return index
  }

  readAfter(after: number, limit: number): StoredFrame[] {
    return this.frames.slice(Math.max(0, after), Math.max(0, after) + limit)
  }

  count(): number {
    return this.frames.length
  }

  lastIndex(): number {
    return this.frames.length
  }

  lastSeq(client: ClientId): number {
    return this.seqs.get(client) ?? 0
  }

  setLastSeq(client: ClientId, seq: number): void {
    this.seqs.set(client, seq)
  }

  identity(client: ClientId): StoredIdentity | undefined {
    return this.identities.get(client)
  }

  setIdentity(client: ClientId, identity: StoredIdentity): void {
    this.identities.set(client, identity)
  }

  blob(blobId: string): BlobRecord | undefined {
    const blob = this.blobs.get(blobId)
    return blob ? toRecord(blob) : undefined
  }

  putChunk(
    blobId: string,
    uploader: ClientId,
    count: number,
    index: number,
    bytes: string,
    byteLength: number,
  ): BlobRecord {
    let blob = this.blobs.get(blobId)
    if (!blob) {
      blob = { blobId, uploader, count, received: 0, bytes: 0, done: false, chunkMap: new Map() }
      this.blobs.set(blobId, blob)
    }
    if (!blob.chunkMap.has(index)) {
      blob.chunkMap.set(index, bytes)
      blob.received += 1
      blob.bytes += byteLength
      blob.done = blob.received === blob.count
    }
    return toRecord(blob)
  }

  hasChunk(blobId: string, index: number): boolean {
    return this.blobs.get(blobId)?.chunkMap.has(index) ?? false
  }

  chunks(blobId: string): Iterable<StoredChunk> {
    const blob = this.blobs.get(blobId)
    if (!blob) return []
    return [...blob.chunkMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([index, bytes]) => ({ index, bytes }))
  }

  deleteBlob(blobId: string): void {
    this.blobs.delete(blobId)
  }

  blobBytes(): number {
    let total = 0
    for (const blob of this.blobs.values()) total += blob.bytes
    return total
  }

  deleteContent(): void {
    this.frames = []
    this.seqs.clear()
    this.identities.clear()
    this.blobs.clear()
  }

  deleteAll(): void {
    this.deleteContent()
    this.metaRow = undefined
  }
}

function toRecord(blob: MemoryBlob): BlobRecord {
  const { blobId, uploader, count, received, bytes, done } = blob
  return { blobId, uploader, count, received, bytes, done }
}

export type { ClientId }
