import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { DocumentKind, DocumentMeta } from '../schemas/project'
import { Chunk, EmbeddingStatus, SearchHit } from '../schemas/document'
import { PackCopyState } from '../schemas/project-packs'

const P = z.object({ projectPath: z.string().min(1) })
const JobRef = z.object({ jobId: SafeId })

/**
 * A listed document. One imported from a pack (`source`) also carries its copy state against
 * <project>/packs.json and the installed pack (edited / pack missing / update available, #269).
 */
export const DocumentListItem = DocumentMeta.extend({ copy: PackCopyState.optional() })
export type DocumentListItem = z.infer<typeof DocumentListItem>

export const documentChannels = {
  'documents:import': channel(
    P.extend({ filePaths: z.array(z.string()).min(1) }),
    z.object({ jobId: SafeId, documents: z.array(DocumentMeta) }),
  ),
  'documents:list': channel(P, z.array(DocumentListItem)),
  'documents:update': channel(
    P.extend({
      documentId: SafeId,
      patch: z.object({
        title: z.string().optional(),
        shortName: z.string().optional(),
        kind: DocumentKind.optional(),
        tags: z.array(z.string()).optional(),
      }),
    }),
    DocumentMeta,
  ),
  'documents:remove': channel(P.extend({ documentId: SafeId }), z.void()),
  'documents:reingest': channel(P.extend({ documentId: SafeId }), JobRef),
  'documents:chunks': channel(
    P.extend({
      documentId: SafeId,
      limit: z.number().int().positive().default(200),
      offset: z.number().int().nonnegative().default(0),
    }),
    z.array(Chunk),
  ),
  'documents:text': channel(P.extend({ documentId: SafeId }), z.string()),
  'index:rebuild': channel(P, JobRef),
  'retrieve:search': channel(
    P.extend({
      query: z.string().min(1),
      k: z.number().int().positive().max(100).default(10),
      mode: z.enum(['hybrid', 'fts', 'vector']).default('hybrid'),
      documentIds: z.array(SafeId).optional(),
    }),
    z.array(SearchHit),
  ),
  /** With projectPath, provider mode reports that project's Embeddings routing (#160). */
  'embeddings:status': channel(
    z.object({ projectPath: z.string().min(1).optional() }).optional(),
    EmbeddingStatus,
  ),
  'embeddings:download-model': channel(z.void(), JobRef),
}
