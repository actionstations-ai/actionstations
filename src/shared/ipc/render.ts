import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { Brand } from '../schemas/project'
import { MediaAsset } from '../schemas/media'

export const TemplateInfo = z.object({
  type: z.string(),
  label: z.string(),
  version: z.string(),
  /** JSON Schema (draft 2020-12) for the inject's fields. */
  schema: z.record(z.string(), z.unknown()),
  preview: z.record(z.string(), z.unknown()),
  paper: z.boolean(),
  variants: z.array(z.string()).default([]),
  width: z.number().int(),
  height: z.number().int().optional(),
})
export type TemplateInfo = z.infer<typeof TemplateInfo>

export const renderChannels = {
  'templates:list': channel(z.void(), z.array(TemplateInfo)),
  'render:preview': channel(
    z.object({
      type: z.string(),
      fields: z.record(z.string(), z.unknown()),
      brand: Brand.optional(),
      variant: z.string().optional(),
      projectPath: z.string().optional(),
      scenarioId: SafeId.optional(),
      scale: z.number().min(0.5).max(3).default(1),
    }),
    z.object({ dataUrl: z.string(), width: z.number(), height: z.number() }),
  ),
  'render:inject': channel(
    z.object({ projectPath: z.string(), scenarioId: SafeId, injectId: SafeId }),
    z.array(MediaAsset),
  ),
}
