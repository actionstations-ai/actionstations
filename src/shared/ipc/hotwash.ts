// Hot wash recording and transcription (#425, spec 0425 §6).
import { z } from 'zod'
import { channel } from './define'
import { SafeId, patchOf } from '../schemas/common'
import {
  AarTranscriptCite,
  HOTWASH_MAX_CHUNK_BYTES,
  HOTWASH_MAX_SEC,
  HotwashRecording,
  HotwashSettings,
  Transcript,
} from '../schemas/hotwash'

const S = z.object({ projectPath: z.string().min(1), scenarioId: SafeId })
const R = S.extend({ recordingId: SafeId })
const JobRef = z.object({ jobId: SafeId })

/** ISO 639-1 language for the built-in multilingual models. */
const Language = z.string().regex(/^[a-z]{2,3}$/)

export const MicArmResult = z.object({
  /** macOS answer from systemPreferences; 'granted' elsewhere (the OS asks in getUserMedia). */
  access: z.enum(['granted', 'denied', 'restricted', 'not-determined', 'unknown']),
})
export type MicArmResult = z.infer<typeof MicArmResult>

export const HotwashListing = z.object({
  recordings: z.array(HotwashRecording),
  transcripts: z.array(Transcript),
  settings: HotwashSettings,
  /** Free space on the project's disk, when the OS reports it. */
  freeBytes: z.number().nonnegative().optional(),
  /** The recording this app is capturing right now, in this scenario. */
  activeRecordingId: SafeId.optional(),
})
export type HotwashListing = z.infer<typeof HotwashListing>

export const SpeechModelView = z.object({
  id: z.string(),
  name: z.string(),
  label: z.string(),
  params: z.string(),
  downloadBytes: z.number(),
  speed: z.string(),
  multilingual: z.boolean(),
  downloaded: z.boolean(),
  /** The default for this computer (whisper-small with 16 GB or more, else whisper-base). */
  recommended: z.boolean(),
})
export type SpeechModelView = z.infer<typeof SpeechModelView>

export const hotwashChannels = {
  /** The user pressed Record: allow one microphone request from the main window. */
  'hotwash:mic-arm': channel(z.void(), MicArmResult),
  'hotwash:record-start': channel(
    S.extend({
      title: z.string().max(200).optional(),
      /** The facilitator confirmed that everyone present was told (FR-6). */
      consent: z.literal(true),
      exerciseMin: z.number().nonnegative().optional(),
      device: z.string().max(200).optional(),
    }),
    HotwashRecording,
  ),
  /** An audio file decoded in the renderer; its samples follow through hotwash:append. */
  'hotwash:import-start': channel(
    S.extend({
      name: z.string().min(1).max(260),
      durationSec: z.number().positive().max(HOTWASH_MAX_SEC),
    }),
    HotwashRecording,
  ),
  'hotwash:append': channel(
    R.extend({
      seq: z.number().int().nonnegative(),
      pcm: z
        .instanceof(Uint8Array)
        .refine((b) => b.byteLength > 0 && b.byteLength <= HOTWASH_MAX_CHUNK_BYTES, {
          message: `Chunks hold 1 to ${HOTWASH_MAX_CHUNK_BYTES} bytes`,
        }),
    }),
    z.object({ durationSec: z.number(), full: z.boolean() }),
  ),
  'hotwash:record-pause': channel(R, HotwashRecording),
  'hotwash:record-resume': channel(R, HotwashRecording),
  'hotwash:record-stop': channel(R, HotwashRecording),
  'hotwash:list': channel(S, HotwashListing),
  'hotwash:transcribe': channel(
    R.extend({
      model: z.string().max(200).optional(),
      language: Language.optional(),
      restart: z.boolean().optional(),
    }),
    JobRef,
  ),
  'hotwash:transcript-save': channel(
    R.extend({ transcript: Transcript, revision: z.number().int().nonnegative() }),
    Transcript,
  ),
  'hotwash:redact': channel(R.extend({ segmentId: SafeId }), Transcript),
  'hotwash:delete-audio': channel(R, HotwashRecording),
  'hotwash:delete': channel(R, z.void()),
  /** AAR input (#419): marked quotes, or every non-redacted segment. */
  'hotwash:transcripts': channel(
    S.extend({ quotesOnly: z.boolean().default(true) }),
    z.array(AarTranscriptCite),
  ),
  'hotwash:settings-save': channel(
    z.object({ projectPath: z.string().min(1), patch: patchOf(HotwashSettings) }),
    HotwashSettings,
  ),
  /** Whether a microphone recording runs now (the presentation window's notice). */
  'hotwash:recording-status': channel(
    z.void(),
    z.object({ recording: z.boolean(), notice: z.boolean() }),
  ),
  'providers:speech-models': channel(z.void(), z.array(SpeechModelView)),
  'providers:download-speech-model': channel(z.object({ model: z.string().max(200) }), JobRef),
  'providers:delete-speech-model': channel(z.object({ model: z.string().max(200) }), z.void()),
}

/** A recording started or stopped: the presentation window shows or hides its notice. */
export const HotwashRecordingEvent = z.object({ recording: z.boolean(), notice: z.boolean() })
