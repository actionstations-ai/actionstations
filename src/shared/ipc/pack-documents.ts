// Reference documents from installed packs (#265): the "Add from pack" list on the Documents
// screen and the import that copies chosen files into the project through the ingest pipeline.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { PackId, PackPath, SemVer } from '../schemas/pack'
import { DocumentMeta } from '../schemas/project'

/** One file of a pack's documents[], as the "Add from pack" dialog lists it. */
export const PackDocumentView = z.object({
  packId: PackId,
  packVersion: SemVer,
  packName: z.string(),
  /** The document group (contents.documents id) the file belongs to. */
  slug: z.string(),
  /** Path inside the pack: documents/<slug>/<file>. */
  path: z.string(),
  title: z.string(),
  source: z.string().optional(),
  license: z.string(),
  description: z.string().optional(),
  /** With projectPath: the project document already imported from this pack file. */
  importedDocumentId: SafeId.optional(),
})
export type PackDocumentView = z.infer<typeof PackDocumentView>

export const PackDocumentRef = z.object({ packId: PackId, path: PackPath })
export type PackDocumentRef = z.infer<typeof PackDocumentRef>

export const packDocumentChannels = {
  /** Documents of every enabled pack, sorted by pack id then path. */
  'packs:documents': channel(
    z.object({ projectPath: z.string().min(1).optional() }).optional(),
    z.array(PackDocumentView),
  ),
  /** Copy pack documents into the project and ingest them (same result as documents:import). */
  'packs:importDocuments': channel(
    z.object({
      projectPath: z.string().min(1),
      documents: z.array(PackDocumentRef).min(1).max(200),
    }),
    z.object({ jobId: SafeId, documents: z.array(DocumentMeta) }),
  ),
}
