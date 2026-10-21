import { z } from 'zod'
import { Id } from './common'

export const Chunk = z.object({
  id: z.number().int(),
  documentId: Id,
  headingPath: z.string(),
  page: z.number().int().positive().optional(),
  ord: z.number().int().nonnegative(),
  text: z.string(),
  tokenCount: z.number().int().nonnegative(),
})
export type Chunk = z.infer<typeof Chunk>

export const SearchHit = z.object({
  chunkId: z.number().int(),
  documentId: Id,
  documentTitle: z.string(),
  headingPath: z.string(),
  page: z.number().int().positive().optional(),
  text: z.string(),
  score: z.number(),
  ftsRank: z.number().int().optional(),
  vecRank: z.number().int().optional(),
})
export type SearchHit = z.infer<typeof SearchHit>

export const EmbeddingStatus = z.object({
  mode: z.enum(['local-onnx', 'hash', 'provider']),
  model: z.string(),
  dims: z.number().int(),
  ready: z.boolean(),
  downloaded: z.boolean().default(false),
  message: z.string().optional(),
})
export type EmbeddingStatus = z.infer<typeof EmbeddingStatus>
