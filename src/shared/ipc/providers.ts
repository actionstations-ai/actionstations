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
      }),
    ),
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
