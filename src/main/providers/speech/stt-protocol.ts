// Messages between the main process (stt-host.ts) and the speech-to-text utilityProcess
// (stt-worker.ts), #425. Both sides parse what they receive: a malformed message is a bug,
// and it fails the job instead of writing a bad transcript. No message carries audio; the
// worker reads the WAV file itself, window by window.
import { z } from 'zod'

const Dtype = z.enum(['fp32', 'q8'])

export const TranscribeRequest = z.object({
  id: z.number().int().positive(),
  op: z.literal('transcribe'),
  modelsDir: z.string().min(1),
  model: z.string().min(1),
  dtype: z.object({ encoder_model: Dtype, decoder_model_merged: Dtype }),
  multilingual: z.boolean(),
  audioPath: z.string().min(1),
  language: z
    .string()
    .regex(/^[a-z]{2,3}$/)
    .optional(),
  fromSec: z.number().nonnegative().default(0),
})
export type TranscribeRequest = z.input<typeof TranscribeRequest>

export const WorkerRequest = z.discriminatedUnion('op', [
  TranscribeRequest,
  z.object({ id: z.number().int().positive(), op: z.literal('dispose') }),
])
export type WorkerRequest = z.input<typeof WorkerRequest>

const SegmentOut = z.object({
  startSec: z.number().nonnegative(),
  endSec: z.number().nonnegative(),
  text: z.string(),
})

export const WorkerReply = z.discriminatedUnion('type', [
  z.object({
    id: z.number().int(),
    type: z.literal('window'),
    segments: z.array(SegmentOut),
    doneUntilSec: z.number().nonnegative(),
    progress: z.number().min(0).max(1),
  }),
  z.object({
    id: z.number().int(),
    type: z.literal('done'),
    language: z.string(),
    model: z.string(),
  }),
  z.object({
    id: z.number().int(),
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
  }),
])
export type WorkerReply = z.infer<typeof WorkerReply>
