// Pure helpers for the hot wash recorder (#425): level wording, times, chunking, messages.

export type InputLevel = 'silent' | 'low' | 'good' | 'clipping'

/** Peak and RMS of about one second of audio → what the meter says. */
export function inputLevel(peak: number, rms: number): InputLevel {
  if (peak >= 0.99) return 'clipping'
  if (rms < 0.002) return 'silent'
  if (rms < 0.02) return 'low'
  return 'good'
}

export const LEVEL_TEXT: Record<InputLevel, string> = {
  silent: 'no sound',
  low: 'low',
  good: 'good',
  clipping: 'too loud',
}

/** Bars lit on a five-bar meter. */
export function levelBars(rms: number): number {
  if (rms <= 0) return 0
  const db = 20 * Math.log10(rms)
  return Math.max(0, Math.min(5, Math.round((db + 50) / 9)))
}

/** 0:00:00 from seconds. */
export { recordingClock as formatDuration } from '@shared/hotwash-time'

/** 41 GB, 820 MB. */
export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} GB`
  return `${Math.max(1, Math.round(n / 1e6))} MB`
}

/** Below this the recorder warns before starting (NFR-6: about 115 MB per hour). */
export const LOW_DISK_BYTES = 1e9

/** Bytes of PCM16 per IPC call: well under the 64 KB limit. */
export const CHUNK_BYTES = 32_000

/** Split PCM16 samples into chunks for hotwash:append. */
export function pcmChunks(
  samples: Int16Array,
  chunkBytes = CHUNK_BYTES,
): Uint8Array<ArrayBuffer>[] {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength)
  const out: Uint8Array<ArrayBuffer>[] = []
  for (let i = 0; i < bytes.byteLength; i += chunkBytes)
    out.push(bytes.slice(i, Math.min(bytes.byteLength, i + chunkBytes)))
  return out
}

/** Float samples in [-1, 1] → PCM16. */
export function floatToPcm16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!))
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff
  }
  return out
}

/** Plain words for getUserMedia failures, naming where each OS keeps the switch. */
export function microphoneErrorText(err: unknown, platform: string): string {
  const name = (err as { name?: string })?.name ?? ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    if (platform === 'darwin')
      return 'Microphone access is off for Action Stations. Turn it on in System Settings › Privacy & Security › Microphone, then press Record again.'
    if (platform === 'win32')
      return 'Microphone access is blocked. Allow it in Settings › Privacy & security › Microphone (including "Let desktop apps access your microphone"), then press Record again.'
    return 'Microphone access was refused. Check your system sound settings, then press Record again.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'No microphone was found. Connect one, then press Record again.'
  if (name === 'NotReadableError')
    return 'The microphone is in use by another app or could not be opened.'
  return `Recording could not start: ${(err as Error)?.message ?? String(err)}`
}

/** The audio import limits: 1 GB files, two hours of audio (decoding happens in memory). */
export const IMPORT_MAX_BYTES = 1024 ** 3
export const IMPORT_MAX_SEC = 2 * 60 * 60
export const IMPORT_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.ogg', '.webm'] as const

export function importProblem(
  name: string,
  size: number,
  durationSec?: number,
): string | undefined {
  const lower = name.toLowerCase()
  if (!IMPORT_EXTENSIONS.some((e) => lower.endsWith(e)))
    return `Choose a ${IMPORT_EXTENSIONS.join(', ')} file.`
  if (size > IMPORT_MAX_BYTES) return 'The file is larger than 1 GB. Split it and import the parts.'
  if (durationSec !== undefined && durationSec > IMPORT_MAX_SEC)
    return 'The recording is longer than two hours. Split it and import the parts.'
  return undefined
}

/** Languages offered for the multilingual models (Whisper supports many more). */
export const TRANSCRIBE_LANGUAGES: readonly (readonly [string, string])[] = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['pt', 'Portuguese'],
  ['it', 'Italian'],
  ['nl', 'Dutch'],
  ['pl', 'Polish'],
  ['uk', 'Ukrainian'],
  ['ar', 'Arabic'],
  ['hi', 'Hindi'],
  ['ja', 'Japanese'],
  ['ko', 'Korean'],
  ['zh', 'Chinese'],
]

/** What a recording's status means, in words (never colour alone). */
export const STATUS_TEXT: Record<string, string> = {
  recording: 'Recording',
  paused: 'Paused',
  recovered: 'Recovered after the app closed',
  ready: 'Not transcribed yet',
  transcribing: 'Transcribing',
  transcribed: 'Transcribed',
  error: 'Transcription failed',
}
