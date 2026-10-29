import { z } from 'zod'
import { Citation, Id, IsoDateTime } from './common'
import { MediaAsset } from './media'
import { InjectTranslation, SupportedLanguage } from './translation'
import { InjectType } from '../taxonomy'

export const DeliveryMode = z.enum([
  'hand_to_role',
  'display_main_screen',
  'play_audio',
  'read_aloud',
])
export type DeliveryMode = z.infer<typeof DeliveryMode>

/**
 * How a social post's counts grow after delivery (spec 0428 FR-9). `start` and `peak` map metric
 * names (likes, reposts, ...) to counts; the template's field map says where each one goes.
 */
export const EngagementReply = z.object({
  id: Id,
  /** Exercise minutes after delivery. */
  atMin: z.number().nonnegative().max(600),
  author: z.string().max(80),
  handle: z.string().max(40).optional(),
  text: z.string().max(560),
})
export const EngagementPlan = z.object({
  curve: z.enum(['surge', 'steady', 'fade']).default('steady'),
  start: z.record(z.string(), z.number().int().nonnegative()).default({}),
  peak: z.record(z.string(), z.number().int().nonnegative()).default({}),
  peakAtMin: z.number().positive().max(600).default(30),
  replies: z.array(EngagementReply).max(40).default([]),
})
export type EngagementPlan = z.infer<typeof EngagementPlan>
export type EngagementReply = z.infer<typeof EngagementReply>

/** Media generation plan for an inject (filled by the inject_media_brief stage). */
export const MediaBrief = z.object({
  /** Which render paths to run. */
  paths: z.array(z.enum(['template', 'ai_image', 'ai_video', 'tts'])).default(['template']),
  imagePrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  imageStyle: z.enum(['phone', 'press', 'cctv', 'screen', 'portrait']).optional(),
  /**
   * Scene lighting. `dark` = a power loss: displays off, dim room (#162). `screens-off` =
   * screens blank or dark with the power on: the room keeps its light and lit background
   * signs are repainted unlit where the workflow finds them (#356). Workflows map it to node
   * inputs through `lighting` bindings (sdxl-photo: dark start latent and dark ceiling for
   * `dark`; a masked repaint of saturated lit signs for `screens-off`).
   */
  lighting: z.enum(['normal', 'dark', 'screens-off']).optional(),
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

/** Loose so fields a newer build adds survive a save here (#208). */
export const Inject = z.looseObject({
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
  /** Simulated likes, shares and replies for a social post (spec 0428); absent = static. */
  engagement: EngagementPlan.optional(),
  citations: z.array(Citation).default([]),
  mediaBrief: MediaBrief.optional(),
  assets: z.array(MediaAsset).default([]),
  versions: z.array(InjectVersion).default([]),
  /** Player-language translations (spec 0435); English stays in the fields above. */
  translations: z.partialRecord(SupportedLanguage, InjectTranslation).optional(),
  /** Include a page for this inject in the Master Inject Deck. */
  includeInDeck: z.boolean().default(true),
  locked: z.boolean().default(false),
  updatedAt: IsoDateTime.optional(),
  /** Regional exercises (spec 0440): the organization that wrote it, and its revision. */
  owner: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,40}$/)
    .optional(),
  revision: z.number().int().min(1).optional(),
})
export type Inject = z.infer<typeof Inject>

export const MAX_INJECT_VERSIONS = 20
