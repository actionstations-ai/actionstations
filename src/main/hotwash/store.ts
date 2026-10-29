// Hot wash files on disk (#425): scenarios/<id>/hotwash/<recordingId>/ holds recording.json,
// audio.pcm while recording (renamed to audio.wav on Stop) and transcript.json. Every path is
// built from SafeIds through safeJoin; a stored audioPath is used only when it equals the
// recording folder's own audio.wav, so an edited recording.json cannot point elsewhere.
import { promises as fs } from 'node:fs'
import {
  HotwashRecording,
  HotwashSettings,
  Transcript,
  type HotwashRecording as Recording,
  type Transcript as TranscriptT,
} from '@shared/schemas/hotwash'
import { exists, readJson, safeJoin, toRel, writeJsonAtomic } from '../lib/fs'
import { loadProject, updateProject } from '../project/store'
import { assertSafeId } from '../scenario/layout'
import { requireScenarioDir } from '../scenario/store'

export const AUDIO_PART = 'audio.pcm'
export const AUDIO_FILE = 'audio.wav'
const RECORDING_FILE = 'recording.json'
const TRANSCRIPT_FILE = 'transcript.json'

/** scenarios/<id>/hotwash; throws NOT_FOUND when the scenario does not exist. */
export async function hotwashDir(root: string, scenarioId: string): Promise<string> {
  const layout = await requireScenarioDir(root, scenarioId)
  return safeJoin(layout.dir, 'hotwash')
}

export async function recordingDir(
  root: string,
  scenarioId: string,
  recordingId: string,
): Promise<string> {
  return safeJoin(await hotwashDir(root, scenarioId), assertSafeId(recordingId, 'recording id'))
}

export interface RecordingFiles {
  dir: string
  json: string
  part: string
  wav: string
  transcript: string
  /** Project-relative audio.wav, the only value recording.audioPath may hold. */
  wavRel: string
}

export async function recordingFiles(
  root: string,
  scenarioId: string,
  recordingId: string,
): Promise<RecordingFiles> {
  const dir = await recordingDir(root, scenarioId, recordingId)
  const wav = safeJoin(dir, AUDIO_FILE)
  return {
    dir,
    json: safeJoin(dir, RECORDING_FILE),
    part: safeJoin(dir, AUDIO_PART),
    wav,
    transcript: safeJoin(dir, TRANSCRIPT_FILE),
    wavRel: toRel(root, wav),
  }
}

/** Writes per file run one at a time, so a slow save never lands after a newer one. */
const queues = new Map<string, Promise<unknown>>()
export function serialized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve()
  const run = prev.catch(() => undefined).then(fn)
  queues.set(key, run)
  void run
    .finally(() => {
      if (queues.get(key) === run) queues.delete(key)
    })
    .catch(() => undefined)
  return run
}

export async function readRecording(
  root: string,
  scenarioId: string,
  recordingId: string,
): Promise<Recording> {
  const files = await recordingFiles(root, scenarioId, recordingId)
  return readJson(files.json, HotwashRecording)
}

export async function writeRecording(
  root: string,
  scenarioId: string,
  rec: Recording,
): Promise<Recording> {
  const clean = HotwashRecording.parse(rec)
  const files = await recordingFiles(root, scenarioId, clean.id)
  await serialized(files.json, () => writeJsonAtomic(files.json, clean))
  return clean
}

/** Read-modify-write of recording.json inside the file's queue. */
export async function updateRecording(
  root: string,
  scenarioId: string,
  recordingId: string,
  change: (rec: Recording) => Recording,
): Promise<Recording> {
  const files = await recordingFiles(root, scenarioId, recordingId)
  return serialized(files.json, async () => {
    const next = HotwashRecording.parse(change(await readJson(files.json, HotwashRecording)))
    await writeJsonAtomic(files.json, next)
    return next
  })
}

export async function readTranscript(
  root: string,
  scenarioId: string,
  recordingId: string,
): Promise<TranscriptT | undefined> {
  const files = await recordingFiles(root, scenarioId, recordingId)
  if (!(await exists(files.transcript))) return undefined
  return readJson(files.transcript, Transcript)
}

/** Read-modify-write of transcript.json inside the file's queue; bumps the revision. */
export async function updateTranscript(
  root: string,
  scenarioId: string,
  recordingId: string,
  change: (t: TranscriptT | undefined) => TranscriptT,
): Promise<TranscriptT> {
  const files = await recordingFiles(root, scenarioId, recordingId)
  return serialized(files.transcript, async () => {
    const current = (await exists(files.transcript))
      ? await readJson(files.transcript, Transcript)
      : undefined
    const next = Transcript.parse(change(current))
    next.revision = (current?.revision ?? 0) + 1
    await writeJsonAtomic(files.transcript, next)
    return next
  })
}

/** Absolute audio.wav when the recording still has its audio, else undefined. */
export async function audioFile(
  root: string,
  scenarioId: string,
  rec: Recording,
): Promise<string | undefined> {
  const files = await recordingFiles(root, scenarioId, rec.id)
  if (rec.audioPath !== files.wavRel) return undefined
  return (await exists(files.wav)) ? files.wav : undefined
}

/** Recording ids in a scenario (folders holding a recording.json). */
export async function recordingIds(root: string, scenarioId: string): Promise<string[]> {
  const dir = await hotwashDir(root, scenarioId)
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const ids: string[] = []
  for (const name of names.sort()) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(name)) continue
    if (await exists(safeJoin(dir, name, RECORDING_FILE))) ids.push(name)
  }
  return ids
}

export interface HotwashListing {
  recordings: Recording[]
  transcripts: TranscriptT[]
}

/** Every readable recording and transcript of a scenario; unreadable ones are skipped. */
export async function listHotwash(root: string, scenarioId: string): Promise<HotwashListing> {
  const out: HotwashListing = { recordings: [], transcripts: [] }
  for (const id of await recordingIds(root, scenarioId)) {
    const rec = await readRecording(root, scenarioId, id).catch(() => undefined)
    if (!rec || rec.id !== id) continue
    out.recordings.push(rec)
    const t = await readTranscript(root, scenarioId, id).catch(() => undefined)
    if (t) out.transcripts.push(t)
  }
  out.recordings.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return out
}

/** Remove the audio file (transcript kept) and log it, without content, in the transcript. */
export async function deleteAudio(
  root: string,
  scenarioId: string,
  recordingId: string,
  at: string,
): Promise<Recording> {
  const files = await recordingFiles(root, scenarioId, recordingId)
  await fs.rm(files.wav, { force: true })
  await fs.rm(files.part, { force: true })
  const rec = await updateRecording(root, scenarioId, recordingId, (r) => {
    const { audioPath: _gone, ...rest } = r
    return { ...rest, status: r.status === 'recording' ? 'ready' : r.status } as Recording
  })
  if (await exists(files.transcript))
    await updateTranscript(root, scenarioId, recordingId, (t) => ({
      ...t!,
      updatedAt: at,
      redactions: [...t!.redactions, { at, kind: 'audio' }],
    }))
  return rec
}

/** Remove a recording folder: audio, transcript and all. */
export async function deleteRecording(
  root: string,
  scenarioId: string,
  recordingId: string,
): Promise<void> {
  const dir = await recordingDir(root, scenarioId, recordingId)
  await fs.rm(dir, { recursive: true, force: true })
}

/** The project's hot wash options with defaults. */
export async function hotwashSettings(root: string): Promise<HotwashSettings> {
  return HotwashSettings.parse((await loadProject(root)).hotwash ?? {})
}

export async function saveHotwashSettings(
  root: string,
  patch: Partial<HotwashSettings>,
): Promise<HotwashSettings> {
  const next = await updateProject(root, (p) => {
    p.hotwash = HotwashSettings.parse({ ...(p.hotwash ?? {}), ...patch })
  })
  return HotwashSettings.parse(next.hotwash ?? {})
}
