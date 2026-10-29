import { z } from 'zod'
import { Id, IsoDateTime, RelPath } from './common'

export const MediaKind = z.enum(['image', 'video', 'audio', 'pdf'])
export type MediaKind = z.infer<typeof MediaKind>

export const Provenance = z.object({
  provider: z.string(),
  model: z.string().optional(),
  workflowHash: z.string().optional(),
  prompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  seed: z.number().int().optional(),
  templateId: z.string().optional(),
  templateVersion: z.string().optional(),
  postFx: z.array(z.string()).optional(),
  /** Language of a translated render (spec 0435); absent = the English source. */
  lang: z.string().max(12).optional(),
  createdAt: IsoDateTime,
})
export type Provenance = z.infer<typeof Provenance>

export const MediaAsset = z.object({
  id: Id,
  kind: MediaKind,
  /** Project-root-relative, e.g. scenarios/<scenarioId>/media/<injectId>/<assetId>.png,
   *  so mediaUrl(projectPath, asset.path) works directly. */
  path: RelPath,
  posterPath: RelPath.optional(),
  /** "rendered" = template output; "generated" = AI; "composite" = AI placed into a template. */
  role: z.enum(['rendered', 'generated', 'composite', 'source']).default('rendered'),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  durationSec: z.number().optional(),
  sha256: z.string().optional(),
  provenance: Provenance,
})
export type MediaAsset = z.infer<typeof MediaAsset>
