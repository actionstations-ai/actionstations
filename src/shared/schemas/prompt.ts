import { z } from 'zod'
import { Stage } from './scenario'

export const PromptFrontmatter = z.object({
  name: z.string(),
  stage: Stage,
  version: z.number().int().positive().default(1),
  description: z.string().optional(),
  outputSchema: z.string().optional(),
  /** Which provider task routes this prompt (ideate/draft/critique). */
  task: z.enum(['ideate', 'draft', 'critique', 'translate', 'roleplay']).default('draft'),
  modelHints: z
    .object({ temperature: z.number().optional(), maxTokens: z.number().int().optional() })
    .default({}),
  retrieval: z
    .object({ queries: z.array(z.string()).default([]), k: z.number().int().positive().default(8) })
    .default({ queries: [], k: 8 }),
  variables: z.array(z.string()).default([]),
})
export type PromptFrontmatter = z.infer<typeof PromptFrontmatter>

/** Where a prompt layer comes from: project > global > pack > default (#262). */
export const PromptSource = z.enum(['default', 'pack', 'global', 'project'])
export type PromptSource = z.infer<typeof PromptSource>

/** The pack a pack-layer prompt comes from (provenance, #262 / #269). */
const PackProvenance = {
  packId: z.string().optional(),
  packVersion: z.string().optional(),
  packName: z.string().optional(),
}

export const PromptFile = z.object({
  /** File stem, e.g. "msel_phase". */
  name: z.string(),
  frontmatter: PromptFrontmatter,
  body: z.string(),
  source: PromptSource,
  /** Set when source is 'pack'. */
  ...PackProvenance,
})
export type PromptFile = z.infer<typeof PromptFile>

export const PromptEntry = z.object({
  name: z.string(),
  stage: Stage,
  description: z.string().optional(),
  effectiveSource: PromptSource,
  hasGlobalOverride: z.boolean(),
  hasProjectOverride: z.boolean(),
  /** An enabled pack provides this prompt for the project's domain (overridden or not). */
  hasPackLayer: z.boolean(),
  /** The pack of that layer, when hasPackLayer. */
  ...PackProvenance,
})
export type PromptEntry = z.infer<typeof PromptEntry>
