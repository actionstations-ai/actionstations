// media:confirm-* — the paid-media confirmation before a media batch. Main emits
// media:confirm-needed with what the batch will call; the renderer shows the dialog and answers
// with media:confirm-answer. Providers ticked "Don't ask again" are saved in settings by main.
import { z } from 'zod'
import { channel } from './define'

export const MediaCallCounts = z.object({
  image: z.number().int().min(0),
  video: z.number().int().min(0),
  audio: z.number().int().min(0),
})
export type MediaCallCounts = z.infer<typeof MediaCallCounts>

export const MediaConfirmProvider = z.object({
  providerId: z.string().max(128),
  label: z.string().max(200),
  host: z.string().max(300),
  counts: MediaCallCounts,
  /** Estimated cost in US dollars, present when every planned call has a price per call. */
  estimateUsd: z.number().min(0).optional(),
})
export type MediaConfirmProvider = z.infer<typeof MediaConfirmProvider>

export const MediaConfirmNeededEvent = z.object({
  requestId: z.string().max(100),
  providers: z.array(MediaConfirmProvider).min(1).max(50),
  /** Sum of the providers' estimates, present when every provider has one. */
  totalEstimateUsd: z.number().min(0).optional(),
})
export type MediaConfirmNeededEvent = z.infer<typeof MediaConfirmNeededEvent>

export const mediaConfirmChannels = {
  /** The user's answer to a media:confirm-needed event. */
  'media:confirm-answer': channel(
    z.strictObject({
      requestId: z.string().max(100),
      decision: z.enum(['continue', 'cancel']),
      /** Providers to stop asking about (only honoured with `continue`). */
      dontAskAgain: z.array(z.string().max(128)).max(50).default([]),
    }),
    z.void(),
  ),
}
