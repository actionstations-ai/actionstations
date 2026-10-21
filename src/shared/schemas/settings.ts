import { z } from 'zod'
import { RecentProject } from './project'
import { ProviderConfig, ProviderRouting } from './provider'

export const EmbeddingSettings = z.object({
  mode: z.enum(['local-onnx', 'hash', 'provider']).default('hash'),
  /** For local-onnx: HF model id. For provider: model name on that provider. */
  model: z.string().default('Xenova/bge-small-en-v1.5'),
  providerId: z.string().optional(),
})
export type EmbeddingSettings = z.infer<typeof EmbeddingSettings>

export const UiSettings = z.object({ theme: z.enum(['system', 'light', 'dark']).default('system') })
export type UiSettings = z.infer<typeof UiSettings>

export const AppSettings = z.object({
  recentProjects: z.array(RecentProject).default([]),
  providers: z.array(ProviderConfig).default([]),
  /** Global default routing; a project's providerRouting overrides per task. */
  defaultRouting: ProviderRouting.default({}),
  embeddings: EmbeddingSettings.default({ mode: 'hash', model: 'Xenova/bge-small-en-v1.5' }),
  ui: UiSettings.default({ theme: 'system' }),
  onboardingComplete: z.boolean().default(false),
  defaultProjectsDir: z.string().optional(),
})
export type AppSettings = z.infer<typeof AppSettings>
