// The `transcribe` job (#425): runs the routed speech-to-text provider over a recording and
// saves each finished window to transcript.json before the next one starts, so Retry after a
// crash, a quit or Cancel continues from the last saved window. Job payloads, logs and
// messages carry ids, counts and times only, never transcript text (NFR-2).
import type { HotwashRecording, Transcript } from '@shared/schemas/hotwash'
import { recordingClock as clock } from '@shared/hotwash-time'
import { emit } from '../lib/events'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { jobs, type JobContext } from '../jobs/manager'
import { resolveSpeechToTextProvider, type ResolvedSpeech } from '../providers/resolve'
import {
  LOCAL_WHISPER_ID,
  isWhisperDownloaded,
  pickWhisperModel,
  speechModelsDir,
} from '../providers/speech/local-whisper/provider'
import type { TranscribeProgress } from '../providers/types'
import {
  audioFile,
  deleteAudio,
  hotwashSettings,
  readRecording,
  readTranscript,
  updateRecording,
  updateTranscript,
} from './store'
import { isActive } from './recorder'

export interface TranscribeOptions {
  model?: string
  language?: string
  /** Start over even when a finished transcript exists (its edits are replaced). */
  restart?: boolean
}

/** The model name the transcript records, known before the provider runs. */
function plannedModel(resolved: ResolvedSpeech, requested: string | undefined): string {
  if (resolved.providerId !== LOCAL_WHISPER_ID) return requested ?? resolved.model ?? 'default'
  const model = pickWhisperModel(requested, speechModelsDir())
  if (!isWhisperDownloaded(model))
    throw new AppError(
      'VALIDATION',
      `The speech model ${model.name} is not downloaded. Download it in Settings › Speech to text.`,
    )
  return model.name
}

/** Where to start: resume an unfinished transcript of the same model and provider, else 0. */
function resumePoint(
  existing: Transcript | undefined,
  model: string,
  providerId: string,
  restart: boolean,
): number {
  if (!existing) return 0
  if (existing.complete && !restart)
    throw new AppError(
      'CONFLICT',
      'This recording already has a transcript. Choose Transcribe again to replace it.',
    )
  const same = existing.model === model && existing.providerId === providerId
  return !restart && same ? existing.doneUntilSec : 0
}

function newTranscript(
  rec: HotwashRecording,
  model: string,
  providerId: string,
  language: string,
): Transcript {
  const at = nowIso()
  return {
    id: newId(),
    recordingId: rec.id,
    model,
    providerId,
    language,
    createdAt: at,
    updatedAt: at,
    doneUntilSec: 0,
    complete: false,
    revision: 0,
    segments: [],
    redactions: [],
  }
}

interface RunInput {
  root: string
  scenarioId: string
  rec: HotwashRecording
  audioPath: string
  resolved: ResolvedSpeech
  model: string
  fromSec: number
  opts: TranscribeOptions
}

const changed = (root: string, scenarioId: string) =>
  emit('project:changed', { path: root, what: 'hotwash', scenarioId })

async function runTranscription(input: RunInput, ctx: JobContext): Promise<{ segments: number }> {
  const { root, scenarioId, rec, resolved } = input
  await updateRecording(root, scenarioId, rec.id, (r) => {
    const { error: _old, ...rest } = r
    return { ...rest, status: 'transcribing' }
  })
  changed(root, scenarioId)
  ctx.progress(0, `Transcribing from ${clock(input.fromSec)}`)
  let started = false
  const result = await resolved.provider.transcribe(
    {
      audioPath: input.audioPath,
      model: input.model,
      fromSec: input.fromSec,
      signal: ctx.signal,
      ...(input.opts.language ? { language: input.opts.language } : {}),
    },
    async (w) => {
      // The first window of a fresh run replaces any earlier transcript; later ones append.
      if (!started && input.fromSec === 0) await startFresh(input)
      started = true
      await appendWindow(input, w)
      ctx.progress(w.progress, `Transcribed ${clock(w.doneUntilSec)} of ${clock(rec.durationSec)}`)
      changed(root, scenarioId)
    },
  )
  // Audio goes first (default), so the transcript's last write is the one marking it complete
  // and an editor opened on the finished transcript never sees a later revision.
  if (!(await hotwashSettings(root)).keepAudio)
    await deleteAudio(root, scenarioId, rec.id, nowIso())
  const t = await updateTranscript(root, scenarioId, rec.id, (cur) => ({
    ...(cur ?? newTranscript(rec, input.model, resolved.providerId, result.language)),
    language: result.language,
    complete: true,
    updatedAt: nowIso(),
  }))
  await updateRecording(root, scenarioId, rec.id, (r) => ({ ...r, status: 'transcribed' }))
  changed(root, scenarioId)
  ctx.log(`Transcript saved: ${t.segments.length} segments`)
  return { segments: t.segments.length }
}

async function startFresh(input: RunInput): Promise<void> {
  const { root, scenarioId, rec, model, resolved } = input
  await updateTranscript(root, scenarioId, rec.id, () =>
    newTranscript(rec, model, resolved.providerId, input.opts.language ?? 'en'),
  )
}

async function appendWindow(input: RunInput, w: TranscribeProgress): Promise<void> {
  const { root, scenarioId, rec } = input
  await updateTranscript(root, scenarioId, rec.id, (t) => ({
    ...t!,
    updatedAt: nowIso(),
    doneUntilSec: w.doneUntilSec,
    segments: [
      ...t!.segments,
      ...w.segments.map((s) => ({
        id: newId(),
        startSec: s.startSec,
        endSec: s.endSec,
        text: s.text,
        originalText: s.text,
        redacted: false,
        lowConfidence: false,
      })),
    ],
  }))
}

async function markFailed(
  root: string,
  scenarioId: string,
  recordingId: string,
  err: unknown,
): Promise<void> {
  const e = err as AppError
  await updateRecording(root, scenarioId, recordingId, (r) =>
    e.code === 'CANCELLED'
      ? { ...r, status: 'ready' }
      : { ...r, status: 'error', error: String(e.message ?? err).slice(0, 1000) },
  ).catch(() => undefined)
  changed(root, scenarioId)
}

/** Start a transcribe job for a stopped recording; resolves once the job is queued. */
export async function startTranscription(
  root: string,
  scenarioId: string,
  recordingId: string,
  opts: TranscribeOptions = {},
): Promise<{ jobId: string }> {
  if (isActive(root, scenarioId, recordingId))
    throw new AppError('CONFLICT', 'Stop the recording before transcribing it.')
  const rec = await readRecording(root, scenarioId, recordingId)
  if (rec.status === 'transcribing')
    throw new AppError('CONFLICT', 'This recording is already being transcribed.')
  const audioPath = await audioFile(root, scenarioId, rec)
  if (!audioPath)
    throw new AppError(
      'NOT_FOUND',
      'The audio of this recording was deleted; it cannot be transcribed again.',
    )
  const resolved = await resolveSpeechToTextProvider(root)
  const model = plannedModel(resolved, opts.model ?? resolved.model)
  const existing = await readTranscript(root, scenarioId, recordingId)
  const fromSec = resumePoint(existing, model, resolved.providerId, !!opts.restart)
  const input: RunInput = { root, scenarioId, rec, audioPath, resolved, model, fromSec, opts }
  const job = jobs.start(
    'transcribe',
    async (ctx) => {
      try {
        return await runTranscription(input, ctx)
      } catch (err) {
        await markFailed(root, scenarioId, recordingId, err)
        throw err
      }
    },
    {
      projectPath: root,
      scenarioId,
      payload: { recordingId, model, providerId: resolved.providerId, fromSec },
    },
  )
  return { jobId: job.id }
}
