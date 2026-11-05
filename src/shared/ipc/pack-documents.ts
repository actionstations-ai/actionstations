// Reference documents from installed packs (#265): the "Add from pack" list on the Documents
// screen and the import that copies chosen files into the project through the ingest pipeline.
import { z } from 'zod'
import { channel } from './define'
import { HttpUrl, SafeId } from '../schemas/common'
import { PackId, PackPath, SemVer } from '../schemas/pack'
import { DocumentMeta } from '../schemas/project'

/** One file of a pack's documents[], as the "Add from pack" dialog lists it. */
export const PackDocumentView = z.object({
  packId: PackId,
  packVersion: SemVer,
  packName: z.string(),
  /** The pack is included with the app (ADR-0020). */
  bundled: z.boolean().optional(),
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
  /**
   * The pack lists the document without its file (#1101): the user downloads their own copy
   * from `landing` and adds it; `added` once a copy with the pinned hash is on this computer.
   */
  userSupplied: z
    .object({
      landing: HttpUrl,
      getIt: z.string(),
      size: z.number().int().positive(),
      added: z.boolean(),
    })
    .optional(),
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
  /**
   * Add the user's own copy of a user-supplied pack document (#1101): main opens a file picker,
   * checks the chosen file's size and sha256 against the pack and keeps a copy on this computer.
   * `canceled` when the picker was closed; `message` says why a file was refused.
   */
  'packs:addSuppliedDocument': channel(
    PackDocumentRef,
    z.object({
      ok: z.boolean(),
      canceled: z.boolean().optional(),
      message: z.string().optional(),
    }),
  ),
}
