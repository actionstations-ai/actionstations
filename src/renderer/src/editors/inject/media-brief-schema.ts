// JSON Schema mirror of MediaBrief (src/shared/schemas/inject.ts) so the schema form can edit
// it like template fields. Keep in step with the zod schema.
import type { JsonSchema } from './schema/fields'

const LONG = 2000

export const MEDIA_BRIEF_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    paths: {
      type: 'array',
      title: 'Render paths',
      description: 'Which media to produce for this inject.',
      items: { type: 'string', enum: ['template', 'ai_image', 'ai_video', 'tts'] },
    },
    imagePrompt: {
      type: 'string',
      title: 'Image prompt',
      description:
        'Describe the photo positively (SDXL ignores "no …"): "powered-off dark screens".',
      maxLength: LONG,
    },
    negativePrompt: { type: 'string', title: 'Negative prompt', maxLength: LONG },
    imageStyle: {
      type: 'string',
      title: 'Image style',
      enum: ['phone', 'press', 'cctv', 'screen', 'portrait'],
    },
    videoPrompt: { type: 'string', title: 'Video prompt', maxLength: LONG },
    durationSec: { type: 'number', title: 'Video length (s)', minimum: 1, maximum: 60 },
    voiceLines: {
      type: 'array',
      title: 'Voice lines',
      description: 'Lines for text-to-speech; one speaker per line.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['speaker', 'text'],
        properties: {
          speaker: { type: 'string', title: 'Speaker' },
          voiceStyle: { type: 'string', title: 'Voice style' },
          text: { type: 'string', title: 'Text', maxLength: LONG },
        },
      },
    },
    postFx: {
      type: 'array',
      title: 'Audio effects',
      items: { type: 'string', enum: ['radio', 'phone', 'pa', 'terminal_ambience'] },
    },
  },
}
