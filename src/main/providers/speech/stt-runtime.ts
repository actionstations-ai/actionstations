// Whisper through transformers.js, offline only (#425). Runs inside the speech-to-text
// utilityProcess (stt-worker.ts); Vitest runs it in-process with a fake pipeline. Reads the
// recording window by window, so memory does not grow with its length, and posts each
// finished window's segments before starting the next one.
import type * as TransformersModule from '@huggingface/transformers'
import { AppError } from '../../lib/errors'
import { readWavInfo, readWavWindow } from '../../lib/wav-pcm'
import { TranscribeRequest, type WorkerReply } from './stt-protocol'
import { seekLoop } from './windows'

export interface AsrChunk {
  text: string
  timestamp: [number, number | null]
}
export type AsrPipeline = ((
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text: string; chunks?: AsrChunk[] }>) & { dispose?: () => Promise<void> }

export type LoadPipeline = (
  modelsDir: string,
  model: string,
  dtype: TranscribeRequest['dtype'],
) => Promise<AsrPipeline>

type Transformers = typeof TransformersModule
let transformersPromise: Promise<Transformers> | undefined

async function loadTransformers(modelsDir: string): Promise<Transformers> {
  transformersPromise ??= import('@huggingface/transformers')
  const t = await transformersPromise
  t.env.cacheDir = modelsDir
  t.env.localModelPath = modelsDir
  t.env.allowLocalModels = true
  // Never fetch: the only download is the user-started one with pinned hashes.
  t.env.allowRemoteModels = false
  return t
}

const pipelines = new Map<string, Promise<AsrPipeline>>()

/** The real loader: one cached pipeline per model and dtype. */
export const loadWhisperPipeline: LoadPipeline = (modelsDir, model, dtype) => {
  const key = `${modelsDir}\u0000${model}\u0000${JSON.stringify(dtype)}`
  let p = pipelines.get(key)
  if (!p) {
    p = loadTransformers(modelsDir).then(
      (t) =>
        t.pipeline('automatic-speech-recognition', model, {
          dtype,
        }) as unknown as Promise<AsrPipeline>,
    )
    p.catch(() => pipelines.delete(key))
    pipelines.set(key, p)
  }
  return p
}

/** Release every loaded model (ONNX sessions hold native memory). */
export async function disposePipelines(): Promise<void> {
  const all = [...pipelines.values()]
  pipelines.clear()
  for (const p of all) await (await p.catch(() => undefined))?.dispose?.()
}

function generateOptions(req: TranscribeRequest): Record<string, unknown> {
  const opts: Record<string, unknown> = { return_timestamps: true }
  // English-only models refuse a language or task; multilingual ones default to English
  // (transformers.js has no language detection), so the language is always passed.
  if (req.multilingual) Object.assign(opts, { language: req.language ?? 'en', task: 'transcribe' })
  return opts
}

/**
 * Transcribe one recording, posting a `window` reply after each window and `done` at the end.
 * `isCancelled` is checked between windows (the host also kills the process on cancel).
 */
export async function runTranscription(
  raw: TranscribeRequest,
  post: (reply: WorkerReply) => void,
  deps: { load?: LoadPipeline; isCancelled?: () => boolean } = {},
): Promise<void> {
  const req = TranscribeRequest.parse(raw)
  const info = await readWavInfo(req.audioPath)
  if (info.sampleRate !== 16_000 || info.channels !== 1)
    throw new AppError('VALIDATION', 'Recordings must be 16 kHz mono to transcribe.')
  const asr = await (deps.load ?? loadWhisperPipeline)(req.modelsDir, req.model, req.dtype)
  const options = generateOptions(req)
  const total = info.durationSec
  await seekLoop(
    total,
    req.fromSec,
    async (w) => {
      const samples = await readWavWindow(req.audioPath, info, w.startSec, w.endSec)
      const out = await asr(samples, options)
      const chunks = out.chunks ?? [{ text: out.text, timestamp: [0, null] }]
      return chunks.map((c) => ({ text: c.text, startSec: c.timestamp[0], endSec: c.timestamp[1] }))
    },
    (settled) => {
      post({
        id: req.id,
        type: 'window',
        segments: settled.segments,
        doneUntilSec: Math.min(settled.nextStartSec, total),
        progress: total ? Math.min(1, settled.nextStartSec / total) : 1,
      })
    },
    () => {
      if (deps.isCancelled?.()) throw new AppError('CANCELLED', 'Transcription cancelled')
    },
  )
  post({
    id: req.id,
    type: 'done',
    language: req.multilingual ? (req.language ?? 'en') : 'en',
    model: req.model,
  })
}
