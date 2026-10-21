import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { PromptEntry, PromptFile } from '../schemas/prompt'

const Scope = z.enum(['global', 'project'])

export const promptChannels = {
  'prompts:list': channel(z.object({ projectPath: z.string().optional() }), z.array(PromptEntry)),
  'prompts:get': channel(
    z.object({ name: SafeId, projectPath: z.string().optional() }),
    z.object({
      default: PromptFile,
      global: PromptFile.optional(),
      project: PromptFile.optional(),
      effective: PromptFile,
      /** Raw markdown (frontmatter + body) of each layer, for the editor and diff view. */
      raw: z.object({
        default: z.string(),
        global: z.string().optional(),
        project: z.string().optional(),
      }),
    }),
  ),
  'prompts:save': channel(
    z.object({
      name: SafeId,
      scope: Scope,
      projectPath: z.string().optional(),
      raw: z.string(),
    }),
    PromptFile,
  ),
  'prompts:reset': channel(
    z.object({ name: SafeId, scope: Scope, projectPath: z.string().optional() }),
    z.void(),
  ),
}
