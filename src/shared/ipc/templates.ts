// Template layers and the inject type registry over IPC (ADR-0018, #261). templates:list stays
// in ./render; these channels add the registry, the refused templates and "Update from pack".
import { z } from 'zod'
import { channel } from './define'
import { TemplateInfo, TemplateSource } from './render'
import { INJECT_CATEGORIES } from '../taxonomy'
import { PackProblem } from '../schemas/pack'

/** One inject type as the registry has it (built-in, or added by a template layer). */
export const ListedInjectType = z.object({
  id: z.string(),
  label: z.string(),
  category: z.enum(INJECT_CATEGORIES),
  render: z.array(z.enum(['template', 'ai_image', 'ai_video', 'tts'])),
  paper: z.boolean(),
  mvp: z.boolean(),
  defaultDelivery: z.enum(['hand_to_role', 'display_main_screen', 'play_audio', 'read_aloud']),
  domains: z.array(z.string()).optional(),
  /** Absent for built-in types. */
  source: z.enum(['project', 'user', 'pack']).optional(),
  pack: z.object({ id: z.string(), version: z.string(), name: z.string().optional() }).optional(),
})
export type ListedInjectType = z.infer<typeof ListedInjectType>

/** A template the checker refused in a non-built-in layer (skipped; the next layer applies). */
export const RefusedTemplateView = z.object({
  type: z.string(),
  source: TemplateSource,
  dir: z.string(),
  packId: z.string().optional(),
  packVersion: z.string().optional(),
  packName: z.string().optional(),
  problems: z.array(PackProblem),
})
export type RefusedTemplateView = z.infer<typeof RefusedTemplateView>

/** Pushed when the registered (user and pack) inject types change. */
export const TemplatesChangedEvent = z.object({ types: z.number().int().nonnegative() })

const Scope = z.object({ projectPath: z.string().optional() }).optional()

export const templateChannels = {
  /** Built-in types, then those added by user and pack templates (and the project's own). */
  'templates:taxonomy': channel(Scope, z.array(ListedInjectType)),
  /** Templates refused at load (script, remote URL…) in the project, user and pack layers. */
  'templates:refused': channel(Scope, z.array(RefusedTemplateView)),
  /**
   * Replace the project's copy of a pack template with the installed pack's version. An
   * edited copy is refused (CONFLICT) unless `confirmEdited`.
   */
  'templates:updateFromPack': channel(
    z.object({
      projectPath: z.string(),
      type: z.string().regex(/^[a-z0-9_]+$/),
      confirmEdited: z.boolean().optional(),
    }),
    TemplateInfo,
  ),
}
