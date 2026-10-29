// Voice lines and spoken answers (spec 0429 FR-16 to FR-20). A persona line is rendered through
// the routed `audio` provider with the persona's voice and post-FX. A player's recording arrives
// as a 16 kHz mono WAV, is transcribed on this computer with the `transcribe` task, and is kept
// only when the controller asked for it.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { PersonaCard, ProviderConfig } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import { ensureDir, safeJoin, toRel } from '../lib/fs'
import { applyPostFx } from '../providers/media/audio-fx'
import { decodeWav } from '../providers/media/audio-fx/wav'
import {
  configFor,
  mediaProviderFor,
  resolveMediaProvider,
  resolveSpeechToTextProvider,
} from '../providers/resolve'
import {
  LOCAL_WHISPER_ID,
  isWhisperDownloaded,
  pickWhisperModel,
  speechModelsDir,
} from '../providers/speech/local-whisper/provider'
import type { MediaProvider } from '../providers/types'
import { scenarioLayout } from '../scenario/layout'

/** Longest spoken line or answer, in seconds (spec 0429 FR-10, NFR-4). */
export const MAX_CLIP_SECONDS = 60
const SAMPLE_RATE = 16_000

export interface RenderedLine {
  /** Project-relative path of the WAV. */
  path: string
  durationSec: number
  bytes: Uint8Array
}

/** The provider for a persona: its own, else the one routed to `audio`, with its voice applied. */
async function voiceProvider(root: string, card: PersonaCard): Promise<MediaProvider> {
  const base = card.voice.providerId
    ? await mediaProviderFor(await configFor(card.voice.providerId, 'audio'))
    : (await resolveMediaProvider('audio', root)).provider
  const voice = card.voice.voiceId?.trim()
  if (!voice) return base
  // The system voice adapter picks a voice per speaker from its `voices` option.
  const config: ProviderConfig = {
    ...base.config,
    options: {
      ...base.config.options,
      voices: {
        ...((base.config.options.voices as Record<string, string> | undefined) ?? {}),
        [card.displayName]: voice,
      },
    },
  }
  return mediaProviderFor(config)
}

/** Speak `text` as the persona. The file is written under the scenario's media/_calls folder. */
export async function renderLine(
  root: string,
  scenarioId: string,
  card: PersonaCard,
  text: string,
  signal?: AbortSignal,
): Promise<RenderedLine> {
  const provider = await voiceProvider(root, card)
  if (!provider.capabilities().has('audio'))
    throw new AppError(
      'VALIDATION',
      'The voice provider cannot speak. Choose another in Providers.',
    )
  const dir = safeJoin(scenarioLayout(root, scenarioId).media, '_calls')
  await ensureDir(dir)
  const [out] = await provider.generate({
    kind: 'audio',
    injectId: 'call',
    brief: {
      paths: ['tts'],
      voiceLines: [
        {
          speaker: card.displayName,
          voiceStyle: card.voice.voiceId ?? '',
          text: text.slice(0, 2000),
        },
      ],
    },
    outDir: dir,
    ...(signal ? { signal } : {}),
  })
  if (!out) throw new AppError('PROVIDER', 'The voice provider returned no audio')
  let bytes: Uint8Array = new Uint8Array(await fs.readFile(out.filePath))
  if (card.voice.postFx.length) bytes = applyPostFx(bytes, card.voice.postFx)
  const file = join(dir, `${newId()}.wav`)
  await fs.writeFile(file, bytes)
  await fs.rm(out.filePath, { force: true })
  const { samples, sampleRate } = decodeWav(bytes)
  return {
    path: toRel(root, file),
    durationSec: Math.round((samples.length / sampleRate) * 100) / 100,
    bytes,
  }
}

/** True when a player's recording would be transcribed: a local provider is ready. */
export async function speechReady(root: string): Promise<boolean> {
  try {
    const resolved = await resolveSpeechToTextProvider(root)
    if (resolved.providerId !== LOCAL_WHISPER_ID) return true
    return isWhisperDownloaded(pickWhisperModel(resolved.model, speechModelsDir()))
  } catch {
    return false
  }
}

interface WavInfo {
  channels: number
  sampleRate: number
  bits: number
  dataBytes: number
}

/** Read the RIFF header of a PCM WAV without decoding it; undefined when it is not one. */
function wavInfo(bytes: Uint8Array): WavInfo | undefined {
  const text = (at: number, n: number) => String.fromCharCode(...bytes.subarray(at, at + n))
  if (bytes.length < 44 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE') return undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let fmt: Omit<WavInfo, 'dataBytes'> | undefined
  for (let at = 12; at + 8 <= bytes.length;) {
    const id = text(at, 4)
    const size = view.getUint32(at + 4, true)
    if (id === 'fmt ' && size >= 16 && view.getUint16(at + 8, true) === 1)
      fmt = {
        channels: view.getUint16(at + 10, true),
        sampleRate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true),
      }
    if (id === 'data') return fmt && { ...fmt, dataBytes: Math.min(size, bytes.length - at - 8) }
    at += 8 + size + (size % 2)
  }
  return undefined
}

/**
 * Check a player's recording before it is used: 16 kHz mono 16-bit PCM WAV, not longer than a
 * call turn. The bytes came from a device, so nothing about them is trusted. Returns seconds.
 */
export function assertClip(bytes: Uint8Array, maxBytes: number): number {
  if (bytes.length > maxBytes || bytes.length < 1000)
    throw new AppError('VALIDATION', 'The recording is empty or too large')
  const info = wavInfo(bytes)
  if (!info) throw new AppError('VALIDATION', 'The recording is not a WAV file')
  if (info.sampleRate !== SAMPLE_RATE || info.channels !== 1 || info.bits !== 16)
    throw new AppError('VALIDATION', 'The recording is not 16 kHz mono')
  const seconds = info.dataBytes / (SAMPLE_RATE * 2)
  if (seconds > MAX_CLIP_SECONDS + 1) throw new AppError('VALIDATION', 'The recording is too long')
  return seconds
}

export interface Transcribed {
  text: string
  /** Where the WAV is, when the controller chose to keep call recordings. */
  keptAt?: string
}

/**
 * Transcribe a clip on this computer. The WAV is written under `callsDir`, read by the speech
 * provider, and deleted afterwards unless `keep` is set.
 */
export async function transcribeClip(
  root: string,
  callsDir: string,
  bytes: Uint8Array,
  keep: boolean,
  signal?: AbortSignal,
): Promise<Transcribed> {
  assertClip(bytes, bytes.length)
  const resolved = await resolveSpeechToTextProvider(root)
  const model =
    resolved.providerId === LOCAL_WHISPER_ID
      ? pickWhisperModel(resolved.model, speechModelsDir()).name
      : (resolved.model ?? 'default')
  await ensureDir(callsDir)
  const file = join(callsDir, `${newId()}.wav`)
  await fs.writeFile(file, bytes)
  try {
    const parts: string[] = []
    await resolved.provider.transcribe(
      { audioPath: file, model, ...(signal ? { signal } : {}) },
      (w) => void parts.push(...w.segments.map((s) => s.text.trim())),
    )
    const text = parts.join(' ').replace(/\s+/g, ' ').trim()
    if (keep) return { text, keptAt: toRel(root, file) }
    return { text }
  } finally {
    if (!keep) await fs.rm(file, { force: true })
  }
}
