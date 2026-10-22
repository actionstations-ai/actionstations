import { z } from 'zod'
import { Citation, Id, IsoDateTime } from './common'
import { MediaAsset } from './media'
import { InjectType } from '../taxonomy'

export const DeliveryMode = z.enum([
  'hand_to_role',
  'display_main_screen',
  'play_audio',
  'read_aloud',
])
export type DeliveryMode = z.infer<typeof DeliveryMode>

/** Media generation plan for an inject (filled by the inject_media_brief stage). */
export const MediaBrief = z.object({
  /** Which render paths to run. */
  paths: z.array(z.enum(['template', 'ai_image', 'ai_video', 'tts'])).default(['template']),
  imagePrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  imageStyle: z.enum(['phone', 'press', 'cctv', 'screen', 'portrait']).optional(),
  videoPrompt: z.string().optional(),
  durationSec: z.number().optional(),
  /** TTS lines; multi-voice for phone calls. */
  voiceLines: z
    .array(z.object({ speaker: z.string(), voiceStyle: z.string().default(''), text: z.string() }))
    .optional(),
  postFx: z.array(z.enum(['radio', 'phone', 'pa', 'terminal_ambience'])).optional(),
})
export type MediaBrief = z.infer<typeof MediaBrief>

export const InjectSnapshot = z.object({
  title: z.string(),
  type: InjectType,
  fields: z.record(z.string(), z.unknown()),
  instructorNote: z.string().optional(),
  deliveryMode: DeliveryMode,
})

export const InjectVersion = z.object({
  at: IsoDateTime,
  by: z.enum(['user', 'ai']),
  note: z.string().optional(),
  snapshot: InjectSnapshot,
})
export type InjectVersion = z.infer<typeof InjectVersion>

export const Inject = z.object({
  id: Id,
  /** MSEL row id this inject belongs to ("I-07"). */
  mselRowId: z.string(),
  type: InjectType,
  title: z.string(),
  deliveryMode: DeliveryMode.default('hand_to_role'),
  /** Validated against templates/injects/<type>/schema.json. */
  fields: z.record(z.string(), z.unknown()).default({}),
  /** Template variant (meta.json `variants`); the template's first variant when absent. */
  variant: z.string().optional(),
  instructorNote: z.string().optional(),
  citations: z.array(Citation).default([]),
  mediaBrief: MediaBrief.optional(),
  assets: z.array(MediaAsset).default([]),
  versions: z.array(InjectVersion).default([]),
  /** Include a page for this inject in the Master Inject Deck. */
  includeInDeck: z.boolean().default(true),
  locked: z.boolean().default(false),
  updatedAt: IsoDateTime.optional(),
})
export type Inject = z.infer<typeof Inject>

export const MAX_INJECT_VERSIONS = 20
