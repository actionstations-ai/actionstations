// Hot wash recordings and their transcripts (#425, spec 0425). Stored per scenario under
// scenarios/<id>/hotwash/<recordingId>/ as recording.json, audio.wav and transcript.json.
// Both files are loose objects: keys written by a newer build survive a save (ADR-0016).
import { z } from 'zod'
import { Id, IsoDateTime, RelPath, SafeId } from './common'

/** Recording audio format: 16 kHz mono 16-bit PCM, what Whisper reads. */
export const HOTWASH_SAMPLE_RATE = 16_000
/** Longest recording or import (NFR-6): recording stops on its own at 4 hours. */
export const HOTWASH_MAX_SEC = 4 * 60 * 60
/** Largest chunk the renderer may send in one hotwash:append call. */
export const HOTWASH_MAX_CHUNK_BYTES = 64 * 1024

export const RecordingStatus = z.enum([
  'recording',
  'paused',
  'recovered',
  'ready',
  'transcribing',
  'transcribed',
  'error',
])
export type RecordingStatus = z.infer<typeof RecordingStatus>

export const HotwashRecording = z.looseObject({
  id: SafeId,
  title: z.string().max(200).default('Hot wash'),
  source: z.enum(['microphone', 'import']),
  /** Original file name of an import, never a path. */
  importedFrom: z.string().max(260).optional(),
  startedAt: IsoDateTime,
  endedAt: IsoDateTime.optional(),
  /** Exercise clock (minutes) when the recording started. */
  exerciseMinAtStart: z.number().nonnegative().optional(),
  durationSec: z.number().nonnegative().default(0),
  /** Project-relative path of audio.wav; absent once the audio is deleted. */
  audioPath: RelPath.optional(),
  sampleRate: z.literal(HOTWASH_SAMPLE_RATE).default(HOTWASH_SAMPLE_RATE),
  channels: z.literal(1).default(1),
  /** Microphone label shown to the user. */
  device: z.string().max(200).optional(),
  consentConfirmedAt: IsoDateTime.optional(),
  /** Pauses by recording time, with wall-clock times to place quotes on the clock. */
  pauses: z
    .array(
      z.object({
        atSec: z.number().nonnegative(),
        pausedAt: IsoDateTime.optional(),
        resumedAt: IsoDateTime.optional(),
      }),
    )
    .default([]),
  status: RecordingStatus,
  /** Why the last transcription failed (no transcript text). */
  error: z.string().max(1000).optional(),
})
export type HotwashRecording = z.infer<typeof HotwashRecording>

export const TranscriptQuote = z.object({
  objectiveIds: z.array(Id).default([]),
  rowIds: z.array(z.string().max(40)).default([]),
  capability: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
})
export type TranscriptQuote = z.infer<typeof TranscriptQuote>

export const TranscriptSegment = z.object({
  id: SafeId,
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  text: z.string().max(20_000),
  /** What the model wrote; never edited, so a changed quote stays visible. */
  originalText: z.string().max(20_000),
  speaker: z.object({ roleId: Id.optional(), label: z.string().max(200) }).optional(),
  quote: TranscriptQuote.optional(),
  redacted: z.boolean().default(false),
  lowConfidence: z.boolean().default(false),
})
export type TranscriptSegment = z.infer<typeof TranscriptSegment>

export const TranscriptRedaction = z.object({
  at: IsoDateTime,
  segmentId: SafeId.optional(),
  kind: z.enum(['text', 'audio']),
})
export type TranscriptRedaction = z.infer<typeof TranscriptRedaction>

export const Transcript = z.looseObject({
  id: SafeId,
  recordingId: SafeId,
  model: z.string(),
  providerId: z.string(),
  language: z.string(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** Seconds of audio already transcribed; a retry resumes here. */
  doneUntilSec: z.number().nonnegative().default(0),
  /** True once every window is transcribed. */
  complete: z.boolean().default(false),
  /** Bumped on every save; a save with an older revision is refused (CONFLICT). */
  revision: z.number().int().nonnegative().default(0),
  segments: z.array(TranscriptSegment).default([]),
  redactions: z.array(TranscriptRedaction).default([]),
})
export type Transcript = z.infer<typeof Transcript>

/** Per-project hot wash options, stored in project.json as `hotwash`. */
export const HotwashSettings = z.object({
  /**
   * Keep the audio file after its transcript is saved. Off by default: the audio is deleted
   * once the transcript exists, so voices are not kept longer than needed.
   */
  keepAudio: z.boolean().default(false),
  /** Show "This discussion is being recorded" on the presentation window while recording. */
  showRecordingNotice: z.boolean().default(true),
})
export type HotwashSettings = z.infer<typeof HotwashSettings>

/** One quote or segment handed to the AAR draft (#419), cited as T<n>. */
export const AarTranscriptCite = z.object({
  citeKey: z.string(),
  /** transcript:<transcriptId>#<segmentId> */
  ref: z.string(),
  recordingTitle: z.string(),
  /** Recording time "H:MM:SS". */
  at: z.string(),
  /** Wall clock "HH:MM" when the recording start time is known. */
  wallClock: z.string().optional(),
  speakerLabel: z.string().optional(),
  text: z.string(),
  quote: z.boolean(),
  objectiveIds: z.array(z.string()).default([]),
  rowIds: z.array(z.string()).default([]),
  capability: z.string().optional(),
})
export type AarTranscriptCite = z.infer<typeof AarTranscriptCite>
