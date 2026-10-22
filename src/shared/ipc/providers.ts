import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import {
  ModelInfo,
  ProviderConfig,
  ProviderHealth,
  ProviderKind,
  ProviderRouting,
  ProviderView,
} from '../schemas/provider'

const RoutingView = z.object({
  global: ProviderRouting,
  project: ProviderRouting.optional(),
  effective: ProviderRouting,
})

export const providerChannels = {
  'providers:list': channel(z.void(), z.array(ProviderView)),
  'providers:upsert': channel(
    z.object({
      config: ProviderConfig.extend({ id: SafeId.optional() }),
      /** string = set, null = clear, undefined = leave unchanged */
      apiKey: z.string().nullable().optional(),
    }),
    ProviderView,
  ),
  'providers:remove': channel(z.object({ id: SafeId }), z.void()),
  'providers:health': channel(z.object({ id: SafeId }), ProviderHealth),
  'providers:models': channel(z.object({ id: SafeId }), z.array(ModelInfo)),
  'providers:test': channel(
    z.object({ id: SafeId, model: z.string().optional() }),
    z.object({
      ok: z.boolean(),
      sample: z.string().optional(),
      latencyMs: z.number(),
      error: z.string().optional(),
    }),
  ),
  'providers:detect-local': channel(
    z.void(),
    z.array(
      z.object({
        kind: ProviderKind,
        label: z.string(),
        baseUrl: z.string(),
        reachable: z.boolean(),
        models: z.array(z.string()).default([]),
        /** Models currently loaded in memory (LM Studio reports this; others report none). */
        loadedModels: z.array(z.string()).default([]),
      }),
    ),
  ),
  /** Speak one short line through an audio-capable provider; nothing is written to a project. */
  'providers:test-speech': channel(
    z.object({
      id: SafeId,
      text: z.string().max(2000).optional(),
      voiceStyle: z.string().max(500).optional(),
    }),
    z.object({
      ok: z.boolean(),
      /** data:audio/…;base64,… */
      dataUrl: z.string().optional(),
      durationSec: z.number().optional(),
      latencyMs: z.number(),
      error: z.string().optional(),
    }),
  ),
  /** Pull (download) a model into an Ollama provider as a job; progress via job:progress. */
  'providers:pull-model': channel(
    z.object({ id: SafeId, model: z.string().min(1).max(200) }),
    z.object({ jobId: SafeId }),
  ),
  'routing:get': channel(z.object({ projectPath: z.string().optional() }), RoutingView),
  'routing:set': channel(
    z.object({
      scope: z.enum(['global', 'project']),
      projectPath: z.string().optional(),
      routing: ProviderRouting,
    }),
    RoutingView,
  ),
}
