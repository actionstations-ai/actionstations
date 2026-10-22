// Cancellable, resumable model download (#66) against a fake Hugging Face hub.
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_LOCAL_MODEL,
  REQUIRED_FILES,
  downloadModel,
  isModelDownloaded,
  type DownloadProgress,
} from './model-files'

const ONNX_BYTES = 64 * 1024

function bodyFor(file: string): Uint8Array {
  return file.endsWith('.onnx')
    ? new Uint8Array(ONNX_BYTES).fill(7)
    : new TextEncoder().encode('{}')
}

/** A hub that serves every file in 4 KiB chunks; `onChunk` can abort mid-transfer. */
function fakeHub(onChunk?: (url: string, sent: number) => void) {
  const urls: string[] = []
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    const file = url.split('/resolve/main/')[1]!
    const bytes = bodyFor(file)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (init?.signal?.aborted) return controller.error(init.signal.reason)
        if (sent >= bytes.length) return controller.close()
        const chunk = bytes.slice(sent, sent + 4096)
        sent += chunk.length
        controller.enqueue(chunk)
        onChunk?.(url, sent)
      },
    })
    return new Response(stream, { headers: { 'content-length': String(bytes.length) } })
  }) as typeof fetch
  return { fetchImpl, urls }
}

const tmp = () => mkdtempSync(join(tmpdir(), 'ttx-dl-'))

describe('downloadModel', () => {
  it('fetches every required file from the hub with byte progress', async () => {
    const dir = tmp()
    const hub = fakeHub()
    const seen: DownloadProgress[] = []
    await downloadModel(dir, DEFAULT_LOCAL_MODEL, {
      fetchImpl: hub.fetchImpl,
      onProgress: (p) => seen.push(p),
    })
    expect(hub.urls).toEqual(
      REQUIRED_FILES.map((f) => `https://huggingface.co/${DEFAULT_LOCAL_MODEL}/resolve/main/${f}`),
    )
    expect(isModelDownloaded(dir, DEFAULT_LOCAL_MODEL)).toBe(true)
    expect(readFileSync(join(dir, DEFAULT_LOCAL_MODEL, 'onnx/model.onnx'))).toHaveLength(ONNX_BYTES)
    expect(seen.at(-1)!.progress).toBe(1)
    const fractions = seen.map((p) => p.progress)
    expect(fractions.filter((f) => f > 0 && f < 1).length).toBeGreaterThan(5)
  })

  it('stops the transfer when cancelled and leaves no partial file', async () => {
    const dir = tmp()
    const controller = new AbortController()
    const hub = fakeHub((url, sent) => {
      if (url.endsWith('.onnx') && sent >= ONNX_BYTES / 2) controller.abort()
    })
    await expect(
      downloadModel(dir, DEFAULT_LOCAL_MODEL, {
        fetchImpl: hub.fetchImpl,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(hub.urls).toHaveLength(1)
    const onnxDir = join(dir, DEFAULT_LOCAL_MODEL, 'onnx')
    expect(readdirSync(onnxDir)).toEqual([])
    expect(isModelDownloaded(dir, DEFAULT_LOCAL_MODEL)).toBe(false)
  })

  it('resumes by skipping files that are already complete', async () => {
    const dir = tmp()
    const controller = new AbortController()
    const first = fakeHub((url) => {
      if (url.endsWith('tokenizer.json')) controller.abort()
    })
    await expect(
      downloadModel(dir, DEFAULT_LOCAL_MODEL, {
        fetchImpl: first.fetchImpl,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(existsSync(join(dir, DEFAULT_LOCAL_MODEL, 'onnx/model.onnx'))).toBe(true)
    const second = fakeHub()
    await downloadModel(dir, DEFAULT_LOCAL_MODEL, { fetchImpl: second.fetchImpl })
    expect(second.urls.map((u) => u.split('/main/')[1])).toEqual([
      'tokenizer.json',
      'tokenizer_config.json',
    ])
    expect(isModelDownloaded(dir, DEFAULT_LOCAL_MODEL)).toBe(true)
  })

  it('reports HTTP failures as PROVIDER errors', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 404 })) as typeof fetch
    await expect(downloadModel(tmp(), DEFAULT_LOCAL_MODEL, { fetchImpl })).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringContaining('HTTP 404'),
    })
  })
})
