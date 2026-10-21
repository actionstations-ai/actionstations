import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'

export const MediaType = z.enum(['image', 'video', 'audio'])

/** Maps a value from the inject's media brief into a node input of an API-format workflow. */
export const WorkflowBinding = z.object({
  /** [nodeId, "inputs", inputName] */
  target: z.tuple([z.string(), z.literal('inputs'), z.string()]),
  source: z.enum([
    'imagePrompt',
    'negativePrompt',
    'videoPrompt',
    'seed',
    'width',
    'height',
    'durationSec',
    'text',
    'voiceStyle',
    'speaker',
    'inputImage',
    'referenceAudio',
    'literal',
  ]),
  value: z.unknown().optional(),
})
export type WorkflowBinding = z.infer<typeof WorkflowBinding>

export const WorkflowEntry = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: MediaType,
  source: z.enum(['default', 'global', 'project']),
  description: z.string().default(''),
  bindings: z.array(WorkflowBinding),
  requiredNodes: z.array(z.string()),
  missingNodes: z.array(z.string()).optional(),
  sha256: z.string(),
})
export type WorkflowEntry = z.infer<typeof WorkflowEntry>

export const comfyChannels = {
  'comfy:status': channel(
    z.object({ providerId: SafeId }),
    z.object({
      ok: z.boolean(),
      message: z.string().optional(),
      system: z.record(z.string(), z.unknown()).optional(),
      workflows: z.array(z.object({ id: SafeId, missingNodes: z.array(z.string()) })),
    }),
  ),
  'comfy:workflows:list': channel(
    z.object({ projectPath: z.string().optional() }),
    z.array(WorkflowEntry),
  ),
  'comfy:workflows:import': channel(
    z.object({
      projectPath: z.string().optional(),
      filePath: z.string(),
      name: z.string(),
      mediaType: MediaType,
    }),
    WorkflowEntry,
  ),
  'comfy:workflows:save-bindings': channel(
    z.object({
      id: z.string(),
      projectPath: z.string().optional(),
      bindings: z.array(WorkflowBinding),
    }),
    WorkflowEntry,
  ),
  'comfy:workflows:delete': channel(
    z.object({ id: SafeId, projectPath: z.string().optional() }),
    z.void(),
  ),
  'comfy:workflows:inputs': channel(
    z.object({ id: SafeId, projectPath: z.string().optional() }),
    z.array(
      z.object({
        nodeId: z.string(),
        classType: z.string(),
        title: z.string().optional(),
        inputName: z.string(),
        value: z.unknown(),
      }),
    ),
  ),
  'comfy:defaults:get': channel(z.void(), z.partialRecord(MediaType, z.string())),
  'comfy:defaults:set': channel(
    z.partialRecord(MediaType, z.string()),
    z.partialRecord(MediaType, z.string()),
  ),
}
