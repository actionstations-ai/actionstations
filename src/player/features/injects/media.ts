/**
 * Inject media on the device (spec 0412 NFR-2): download a sealed blob, open it in memory and
 * hand the page a `blob:` URL. Nothing is stored by the browser; a URL is revoked when the last
 * view of it goes away, and every URL is dropped when the session ends.
 */
import { useEffect, useState } from 'react'
import type { BlobRef } from '../../../shared/live/schemas'

interface Entry {
  url: Promise<string>
  users: number
}

export interface MediaCacheOptions {
  fetchBlob: (ref: BlobRef) => Promise<Uint8Array>
  createUrl?: (data: Uint8Array, mime: string) => string
  revokeUrl?: (url: string) => void
}

export class MediaCache {
  private readonly entries = new Map<string, Entry>()
  private readonly createUrl: (data: Uint8Array, mime: string) => string
  private readonly revokeUrl: (url: string) => void

  constructor(private readonly opts: MediaCacheOptions) {
    this.createUrl =
      opts.createUrl ??
      ((data, mime) => URL.createObjectURL(new Blob([data as BlobPart], { type: mime })))
    this.revokeUrl = opts.revokeUrl ?? ((url) => URL.revokeObjectURL(url))
  }

  /** A URL for the blob; the caller must `release` it once. A failed download is retried next time. */
  acquire(ref: BlobRef): Promise<string> {
    let entry = this.entries.get(ref.blobId)
    if (!entry) {
      const url = this.opts.fetchBlob(ref).then((bytes) => this.createUrl(bytes, ref.mime))
      entry = { url, users: 0 }
      this.entries.set(ref.blobId, entry)
      url.catch(() => {
        if (this.entries.get(ref.blobId) === entry) this.entries.delete(ref.blobId)
      })
    }
    entry.users += 1
    return entry.url
  }

  release(ref: BlobRef): void {
    const entry = this.entries.get(ref.blobId)
    if (!entry) return
    entry.users -= 1
    if (entry.users > 0) return
    this.entries.delete(ref.blobId)
    void entry.url.then(
      (u) => this.revokeUrl(u),
      () => undefined,
    )
  }

  /** Session end: nothing outlives it. */
  dispose(): void {
    for (const entry of this.entries.values()) {
      void entry.url.then(
        (u) => this.revokeUrl(u),
        () => undefined,
      )
    }
    this.entries.clear()
  }
}

export type BlobState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error'; message: string }

/** The `blob:` URL of a media file, with loading and error states; revoked on unmount. */
export function useBlobUrl(
  cache: MediaCache,
  ref: BlobRef | undefined,
  enabled = true,
  attempt = 0,
): BlobState {
  const key = ref && enabled ? `${ref.blobId}:${attempt}` : undefined
  const [result, setResult] = useState<{ key: string; state: BlobState }>()
  useEffect(() => {
    if (!ref || !key) return
    let live = true
    cache.acquire(ref).then(
      (url) => live && setResult({ key, state: { status: 'ready', url } }),
      (err: unknown) =>
        live &&
        setResult({
          key,
          state: { status: 'error', message: err instanceof Error ? err.message : 'Failed' },
        }),
    )
    return () => {
      live = false
      cache.release(ref)
    }
    // `ref` is identified by its blob id, which `key` carries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, key])
  if (!key) return { status: 'idle' }
  return result?.key === key ? result.state : { status: 'loading' }
}

/** The WebVTT cue texts, in order, for a transcript. */
export function transcriptLines(vtt: string | undefined): string[] {
  if (!vtt) return []
  return vtt
    .split(/\r?\n\r?\n/)
    .map((block) => block.split(/\r?\n/).filter((l) => l && !l.includes('-->') && l !== 'WEBVTT'))
    .map((lines) => lines.join(' '))
    .filter(Boolean)
}
