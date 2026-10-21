import { z } from 'zod'
import { Stage } from './scenario'

export const PromptFrontmatter = z.object({
  name: z.string(),
  stage: Stage,
  version: z.number().int().positive().default(1),
  description: z.string().optional(),
  outputSchema: z.string().optional(),
  /** Which provider task routes this prompt (ideate/draft/critique). */
  task: z.enum(['ideate', 'draft', 'critique']).default('draft'),
  modelHints: z
    .object({ temperature: z.number().optional(), maxTokens: z.number().int().optional() })
    .default({}),
  retrieval: z
    .object({ queries: z.array(z.string()).default([]), k: z.number().int().positive().default(8) })
    .default({ queries: [], k: 8 }),
  variables: z.array(z.string()).default([]),
})
export type PromptFrontmatter = z.infer<typeof PromptFrontmatter>

export const PromptFile = z.object({
  /** File stem, e.g. "msel_phase". */
  name: z.string(),
  frontmatter: PromptFrontmatter,
  body: z.string(),
  source: z.enum(['default', 'global', 'project']),
})
export type PromptFile = z.infer<typeof PromptFile>

export const PromptEntry = z.object({
  name: z.string(),
  stage: Stage,
  description: z.string().optional(),
  effectiveSource: z.enum(['default', 'global', 'project']),
  hasGlobalOverride: z.boolean(),
  hasProjectOverride: z.boolean(),
})
export type PromptEntry = z.infer<typeof PromptEntry>
