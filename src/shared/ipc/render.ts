import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { Brand } from '../schemas/project'
import { MediaAsset } from '../schemas/media'
import { PackCopyState } from '../schemas/project-packs'

/** Template layer (ADR-0018): project > user > pack > built-in. */
export const TemplateSource = z.enum(['project', 'user', 'pack', 'builtin'])
export type TemplateSource = z.infer<typeof TemplateSource>

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
  /** Layer the template comes from. */
  source: TemplateSource,
  /** A pack template, or a project copy of one: the pack it came from. */
  packId: z.string().optional(),
  packVersion: z.string().optional(),
  packName: z.string().optional(),
  /** Served from a pack included with the app (ADR-0020): "Included: <pack name>". */
  bundled: z.boolean().optional(),
  /**
   * From a bundled pack the user disabled: it still renders for projects that use it, but the
   * gallery and the type pickers leave it out.
   */
  hidden: z.boolean().optional(),
  /** The lower layer this template shadows ("replaces built-in tweet template"). */
  replaces: TemplateSource.optional(),
  /** The pack of that lower layer ("replaces Action Stations Core"). */
  replacesPackName: z.string().optional(),
  /** Project copies of pack templates: edited / pack missing / update available. */
  copy: PackCopyState.optional(),
})
export type TemplateInfo = z.infer<typeof TemplateInfo>

export const renderChannels = {
  /** Templates as a project sees them (projectPath) or without a project: user, packs, built-in. */
  'templates:list': channel(
    z.object({ projectPath: z.string().optional() }).optional(),
    z.array(TemplateInfo),
  ),
  'render:preview': channel(
    z.object({
      type: z.string(),
      fields: z.record(z.string(), z.unknown()),
      brand: Brand.optional(),
      variant: z.string().optional(),
      projectPath: z.string().optional(),
      scenarioId: SafeId.optional(),
      /** With projectPath + scenarioId: fill image slots from this inject's AI images. */
      injectId: SafeId.optional(),
      scale: z.number().min(0.5).max(3).default(1),
    }),
    z.object({ dataUrl: z.string(), width: z.number(), height: z.number() }),
  ),
  'render:inject': channel(
    z.object({ projectPath: z.string(), scenarioId: SafeId, injectId: SafeId }),
    z.array(MediaAsset),
  ),
}
