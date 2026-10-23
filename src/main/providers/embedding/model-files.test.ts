// Cancellable, resumable, pinned and checksummed model download (#66, #212) against a fake
// Hugging Face hub. No network.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_LOCAL_MODEL,
  MODEL_PINS,
  REQUIRED_FILES,
  downloadModel as realDownload,
  isModelDownloaded,
  type DownloadOptions,
  type DownloadProgress,
  type ModelPin,
} from './model-files'

const ONNX_BYTES = 64 * 1024

function bodyFor(file: string): Uint8Array {
  return file.endsWith('.onnx')
    ? new Uint8Array(ONNX_BYTES).fill(7)
    : new TextEncoder().encode('{}')
}

const REVISION = 'f'.repeat(40)
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
/** Pins matching the fake hub's bodies, so the fixtures pass verification. */
const TEST_PIN: ModelPin = {
  revision: REVISION,
  sha256: Object.fromEntries(REQUIRED_FILES.map((f) => [f, sha(bodyFor(f))])) as ModelPin['sha256'],
}
const TEST_PINS = { [DEFAULT_LOCAL_MODEL]: TEST_PIN }
const downloadModel = (dir: string, model: string, opts: DownloadOptions = {}) =>
  realDownload(dir, model, { pins: TEST_PINS, ...opts })

/** A hub that serves every file in 4 KiB chunks; `onChunk` can abort mid-transfer. */
function fakeHub(
  onChunk?: (url: string, sent: number) => void,
  body: (file: string) => Uint8Array = bodyFor,
) {
  const urls: string[] = []
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    urls.push(url)
    const file = url.split('/resolve/')[1]!.split('/').slice(1).join('/')
    const bytes = body(file)
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
      REQUIRED_FILES.map(
        (f) => `https://huggingface.co/${DEFAULT_LOCAL_MODEL}/resolve/${REVISION}/${f}`,
      ),
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
    expect(second.urls.map((u) => u.split(`/${REVISION}/`)[1])).toEqual([
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

  it('refuses a file whose sha256 does not match its pin and keeps nothing of it', async () => {
    const dir = tmp()
    const tampered = fakeHub(undefined, (f) =>
      f === 'config.json' ? new TextEncoder().encode('{"evil":1}') : bodyFor(f),
    )
    await expect(downloadModel(dir, DEFAULT_LOCAL_MODEL, tampered)).rejects.toMatchObject({
      code: 'PROVIDER',
      message: expect.stringContaining('config.json does not match its expected checksum'),
    })
    const modelDir = join(dir, DEFAULT_LOCAL_MODEL)
    expect(existsSync(join(modelDir, 'config.json'))).toBe(false)
    expect(readdirSync(modelDir).filter((f) => f.endsWith('.part'))).toEqual([])
    expect(isModelDownloaded(dir, DEFAULT_LOCAL_MODEL)).toBe(false)
  })

  it('re-downloads a file already on disk that does not match its pin', async () => {
    const dir = tmp()
    const modelDir = join(dir, DEFAULT_LOCAL_MODEL)
    mkdirSync(modelDir, { recursive: true })
    writeFileSync(join(modelDir, 'config.json'), '{"stale":true}')
    const hub = fakeHub()
    await downloadModel(dir, DEFAULT_LOCAL_MODEL, hub)
    expect(hub.urls.some((u) => u.endsWith('/config.json'))).toBe(true)
    expect(readFileSync(join(modelDir, 'config.json'), 'utf8')).toBe('{}')
  })

  it('downloads a model without a pin from main, unverified', async () => {
    const hub = fakeHub()
    await realDownload(tmp(), 'Example/custom-embed', { fetchImpl: hub.fetchImpl, pins: {} })
    expect(hub.urls[0]).toBe(
      'https://huggingface.co/Example/custom-embed/resolve/main/onnx/model.onnx',
    )
  })
})

describe('MODEL_PINS', () => {
  it('pins a full commit and a sha256 for every required file of each known model', () => {
    expect(Object.keys(MODEL_PINS)).toContain(DEFAULT_LOCAL_MODEL)
    for (const pin of Object.values(MODEL_PINS)) {
      expect(pin.revision).toMatch(/^[0-9a-f]{40}$/)
      for (const f of REQUIRED_FILES) expect(pin.sha256[f]).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('uses the pinned commit for the default model', async () => {
    const hub = fakeHub()
    await realDownload(tmp(), DEFAULT_LOCAL_MODEL, hub).catch(() => undefined)
    expect(hub.urls[0]).toBe(
      `https://huggingface.co/${DEFAULT_LOCAL_MODEL}/resolve/${MODEL_PINS[DEFAULT_LOCAL_MODEL]!.revision}/onnx/model.onnx`,
    )
  })
})
