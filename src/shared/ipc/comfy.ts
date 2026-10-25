import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { PackCopyState } from '../schemas/project-packs'

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
    'lighting',
  ]),
  /** `literal`: the value. `lighting`: value per brief lighting, e.g. { "dark": 0.92 }. */
  value: z.unknown().optional(),
})
export type WorkflowBinding = z.infer<typeof WorkflowBinding>

/**
 * Where a workflow comes from. Lookup order project > global > pack > default (ADR-0018).
 * `pack` workflows are read-only (edited bindings go to userData/comfy/overrides/packs/).
 */
export const WorkflowSource = z.enum(['default', 'global', 'pack', 'project'])

export const WorkflowEntry = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: MediaType,
  source: WorkflowSource,
  description: z.string().default(''),
  bindings: z.array(WorkflowBinding),
  requiredNodes: z.array(z.string()),
  missingNodes: z.array(z.string()).optional(),
  /** Node classes outside ComfyUI core ("needs custom nodes"). */
  customNodes: z.array(z.string()).optional(),
  sha256: z.string(),
  /** The pack this workflow is from: source `pack`, or a project copy of a pack workflow. */
  packId: z.string().optional(),
  packVersion: z.string().optional(),
  packName: z.string().optional(),
  /** A project copy of a pack workflow (<project>/packs.json): edited / pack missing / update. */
  copy: PackCopyState.optional(),
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
      id: SafeId,
      projectPath: z.string().optional(),
      bindings: z.array(WorkflowBinding),
    }),
    WorkflowEntry,
  ),
  'comfy:workflows:delete': channel(
    z.object({ id: SafeId, projectPath: z.string().optional() }),
    z.void(),
  ),
  /**
   * Replace the project's copy of a pack workflow with the installed pack's version. An edited
   * copy is refused (CONFLICT) unless `confirmEdited`.
   */
  'comfy:workflows:updateFromPack': channel(
    z.object({ id: SafeId, projectPath: z.string(), confirmEdited: z.boolean().optional() }),
    WorkflowEntry,
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
  /** Render one sample through a workflow (Workflows page "Test render"). Blocks until done. */
  'comfy:test-render': channel(
    z.object({
      providerId: SafeId,
      workflowId: SafeId,
      projectPath: z.string().optional(),
      prompt: z.string().max(4000).optional(),
    }),
    z.object({
      mimeType: z.string(),
      /** data: URL of the output (images and short clips) for an inline preview. */
      dataUrl: z.string(),
      seed: z.number().int().optional(),
      elapsedMs: z.number(),
      workflowHash: z.string().optional(),
    }),
  ),
  'comfy:defaults:get': channel(z.void(), z.partialRecord(MediaType, z.string())),
  'comfy:defaults:set': channel(
    z.partialRecord(MediaType, z.string()),
    z.partialRecord(MediaType, z.string()),
  ),
}
