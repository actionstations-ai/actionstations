// Hot wash recorder, main side (#425). The renderer captures 16 kHz mono PCM16 and sends it
// in ~1 s chunks; each chunk is appended to audio.pcm by one serialized writer per recording
// and the file is fsync'd every 10 s. audio.pcm starts with a 44-byte WAV header whose sizes
// are filled in on Stop (or by recovery after a crash), then it is renamed to audio.wav: the
// audio is never copied, and a crash loses at most the last unsynced seconds.
import { promises as fs } from 'node:fs'
import type { FileHandle } from 'node:fs/promises'
import {
  HOTWASH_MAX_CHUNK_BYTES,
  HOTWASH_MAX_SEC,
  HOTWASH_SAMPLE_RATE,
  type HotwashRecording,
} from '@shared/schemas/hotwash'
import { AppError } from '../lib/errors'
import { exists, safeJoin } from '../lib/fs'
import { newId, nowIso } from '../lib/ids'
import { pcm16WavHeader } from '../lib/wav-pcm'
import {
  readRecording,
  recordingFiles,
  recordingIds,
  serialized,
  updateRecording,
  writeRecording,
} from './store'

const HEADER_BYTES = 44
const BYTES_PER_SEC = HOTWASH_SAMPLE_RATE * 2
const MAX_BYTES = HOTWASH_MAX_SEC * BYTES_PER_SEC
const SYNC_EVERY_MS = 10_000

interface Active {
  root: string
  scenarioId: string
  id: string
  handle: FileHandle
  /** Next expected chunk number. */
  seq: number
  /** Sample bytes written (header excluded). */
  bytes: number
  paused: boolean
  lastSync: number
  source: HotwashRecording['source']
}

const active = new Map<string, Active>()
const activeKey = (root: string, scenarioId: string, id: string) =>
  `${root}\u0000${scenarioId}\u0000${id}`

export function isActive(root: string, scenarioId: string, id: string): boolean {
  return active.has(activeKey(root, scenarioId, id))
}

/** The microphone recording running in this app, if any (one at a time). */
export function activeMicrophone(): { root: string; scenarioId: string; id: string } | undefined {
  for (const a of active.values()) if (a.source === 'microphone') return a
  return undefined
}

function requireActive(root: string, scenarioId: string, id: string): Active {
  const a = active.get(activeKey(root, scenarioId, id))
  if (!a) throw new AppError('CONFLICT', 'This recording is not running.')
  return a
}

export interface StartInput {
  root: string
  scenarioId: string
  source: HotwashRecording['source']
  title?: string
  exerciseMin?: number
  device?: string
  importedFrom?: string
  consentConfirmedAt?: string
}

/** Create the recording folder, recording.json and audio.pcm (header placeholder). */
export async function startRecording(input: StartInput): Promise<HotwashRecording> {
  if (input.source === 'microphone' && activeMicrophone())
    throw new AppError('CONFLICT', 'A recording is already running. Stop it first.')
  const id = newId()
  const files = await recordingFiles(input.root, input.scenarioId, id)
  await fs.mkdir(files.dir, { recursive: true })
  const handle = await fs.open(files.part, 'wx')
  try {
    await handle.write(pcm16WavHeader(0, HOTWASH_SAMPLE_RATE), 0, HEADER_BYTES, 0)
    const rec = await writeRecording(input.root, input.scenarioId, {
      id,
      title: input.title?.trim() || (input.source === 'import' ? 'Imported audio' : 'Hot wash'),
      source: input.source,
      startedAt: nowIso(),
      durationSec: 0,
      sampleRate: HOTWASH_SAMPLE_RATE,
      channels: 1,
      pauses: [],
      status: 'recording',
      ...(input.importedFrom ? { importedFrom: input.importedFrom } : {}),
      ...(input.exerciseMin !== undefined ? { exerciseMinAtStart: input.exerciseMin } : {}),
      ...(input.device ? { device: input.device } : {}),
      ...(input.consentConfirmedAt ? { consentConfirmedAt: input.consentConfirmedAt } : {}),
    })
    active.set(activeKey(input.root, input.scenarioId, id), {
      root: input.root,
      scenarioId: input.scenarioId,
      id,
      handle,
      seq: 0,
      bytes: 0,
      paused: false,
      lastSync: Date.now(),
      source: input.source,
    })
    return rec
  } catch (err) {
    await handle.close().catch(() => undefined)
    await fs.rm(files.dir, { recursive: true, force: true })
    throw err
  }
}

export interface AppendResult {
  durationSec: number
  /** True when the 4-hour limit was reached: the caller stops the recording. */
  full: boolean
}

/** Append one chunk. Chunks must arrive in order (seq 0, 1, 2…) while not paused. */
export function appendChunk(
  root: string,
  scenarioId: string,
  id: string,
  seq: number,
  pcm: Uint8Array,
): Promise<AppendResult> {
  const a = requireActive(root, scenarioId, id)
  if (pcm.byteLength > HOTWASH_MAX_CHUNK_BYTES || pcm.byteLength % 2)
    throw new AppError('VALIDATION', 'Audio chunk has the wrong size.')
  if (a.paused) throw new AppError('CONFLICT', 'The recording is paused.')
  if (seq !== a.seq)
    throw new AppError('VALIDATION', `Audio chunk ${seq} out of order (expected ${a.seq}).`)
  a.seq++
  return serialized(`append\u0000${activeKey(root, scenarioId, id)}`, async () => {
    const room = MAX_BYTES - a.bytes
    const take = Math.max(0, Math.min(room, pcm.byteLength))
    if (take > 0) {
      await a.handle.write(pcm, 0, take, HEADER_BYTES + a.bytes)
      a.bytes += take
    }
    if (Date.now() - a.lastSync >= SYNC_EVERY_MS) {
      a.lastSync = Date.now()
      await a.handle.sync()
    }
    return { durationSec: a.bytes / BYTES_PER_SEC, full: a.bytes >= MAX_BYTES }
  })
}

export async function pauseRecording(
  root: string,
  scenarioId: string,
  id: string,
): Promise<HotwashRecording> {
  const a = requireActive(root, scenarioId, id)
  a.paused = true
  const atSec = a.bytes / BYTES_PER_SEC
  return updateRecording(root, scenarioId, id, (r) => ({
    ...r,
    status: 'paused',
    durationSec: atSec,
    pauses: [...r.pauses, { atSec, pausedAt: nowIso() }],
  }))
}

export async function resumeRecording(
  root: string,
  scenarioId: string,
  id: string,
): Promise<HotwashRecording> {
  const a = requireActive(root, scenarioId, id)
  a.paused = false
  const at = nowIso()
  return updateRecording(root, scenarioId, id, (r) => {
    const pauses = [...r.pauses]
    const last = pauses.at(-1)
    if (last && !last.resumedAt) pauses[pauses.length - 1] = { ...last, resumedAt: at }
    return { ...r, status: 'recording', pauses }
  })
}

/** Fill in the WAV sizes of audio.pcm from its length and rename it to audio.wav. */
async function finalizeAudio(part: string, wav: string): Promise<number> {
  const handle = await fs.open(part, 'r+')
  let dataBytes: number
  try {
    const { size } = await handle.stat()
    dataBytes = Math.max(0, size - HEADER_BYTES)
    dataBytes -= dataBytes % 2
    await handle.write(pcm16WavHeader(dataBytes, HOTWASH_SAMPLE_RATE), 0, HEADER_BYTES, 0)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await fs.rename(part, wav)
  return dataBytes / BYTES_PER_SEC
}

/** Stop: finish the WAV and mark the recording ready (or delete it when it holds no audio). */
export async function stopRecording(
  root: string,
  scenarioId: string,
  id: string,
): Promise<HotwashRecording> {
  const key = activeKey(root, scenarioId, id)
  const a = requireActive(root, scenarioId, id)
  active.delete(key)
  await serialized(`append\u0000${key}`, async () => undefined)
  await a.handle.sync().catch(() => undefined)
  await a.handle.close()
  const files = await recordingFiles(root, scenarioId, id)
  const durationSec = await finalizeAudio(files.part, files.wav)
  return updateRecording(root, scenarioId, id, (r) => {
    const pauses = r.pauses.map((p) => (p.resumedAt ? p : { ...p, resumedAt: nowIso() }))
    return {
      ...r,
      status: 'ready',
      endedAt: nowIso(),
      durationSec,
      audioPath: files.wavRel,
      pauses,
    }
  })
}

/** Stop every running recording (app quit, window closed). Errors are logged, not thrown. */
export async function stopAll(): Promise<void> {
  for (const a of [...active.values()])
    await stopRecording(a.root, a.scenarioId, a.id).catch((e: unknown) =>
      console.error('[hotwash] stop on quit failed', e),
    )
}

/**
 * Recordings left with an audio.pcm by a crash or a quit become `recovered`: their audio is
 * kept up to the last bytes written. Recordings running in this app are left alone.
 */
export async function recoverRecordings(root: string, scenarioId: string): Promise<number> {
  let recovered = 0
  for (const id of await recordingIds(root, scenarioId)) {
    if (isActive(root, scenarioId, id)) continue
    const files = await recordingFiles(root, scenarioId, id)
    if (!(await exists(files.part))) continue
    const rec = await readRecording(root, scenarioId, id).catch(() => undefined)
    if (!rec) continue
    const { mtime } = await fs.stat(files.part)
    const durationSec = await finalizeAudio(files.part, files.wav)
    await updateRecording(root, scenarioId, id, (r) => ({
      ...r,
      status: 'recovered',
      endedAt: r.endedAt ?? mtime.toISOString(),
      durationSec,
      audioPath: files.wavRel,
    }))
    recovered++
  }
  return recovered
}

/** Project folders created before #425 get the audio line in their .gitignore. */
export const AUDIO_GITIGNORE_LINE = 'scenarios/*/hotwash/**/audio.*'

export async function ensureAudioGitignore(root: string): Promise<void> {
  const path = safeJoin(root, '.gitignore')
  const current = await fs.readFile(path, 'utf8').catch(() => '')
  if (current.split(/\r?\n/).includes(AUDIO_GITIGNORE_LINE)) return
  const sep = current && !current.endsWith('\n') ? '\n' : ''
  await fs.writeFile(path, `${current}${sep}${AUDIO_GITIGNORE_LINE}\n`)
}
