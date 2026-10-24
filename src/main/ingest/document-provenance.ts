// Copy state of documents imported from packs (#265), for the Documents list badges (#269).
// A pack document's copy record in <project>/packs.json covers its whole group
// (`<packId>/<slug>`); each listed document is checked against its own recorded file only, so
// editing one original marks that document "edited", not its siblings.
import type { DocumentMeta } from '@shared/schemas'
import type { PackCopyState, ProjectPackCopy } from '@shared/schemas/project-packs'
import { packById } from '../packs/layers'
import { copyState, readProjectPacks } from '../packs/project-copies'
import { documentCopyId } from './pack-documents'
import { documentFiles } from './storage'

/** documents/<slug>/<file> → slug. */
const slugOf = (path: string): string => path.split('/')[1] ?? ''

/** The installed pack, when it is enabled and still lists this document file. */
function providingPack(source: NonNullable<DocumentMeta['source']>) {
  const pack = packById(source.packId)
  return pack?.manifest.documents.some((d) => d.path === source.path) ? pack : undefined
}

/** Copy state of one pack document; undefined for the project's own documents. */
async function documentCopyState(
  root: string,
  doc: DocumentMeta,
  copies: readonly ProjectPackCopy[],
): Promise<PackCopyState | undefined> {
  const source = doc.source
  if (!source) return undefined
  const id = documentCopyId(source.packId, slugOf(source.path))
  const record = copies.find((c) => c.kind === 'documents' && c.id === id)
  const rel = documentFiles(root, doc).originalRel
  const file = record?.files.find((f) => f.path === rel)
  const own: ProjectPackCopy = {
    kind: 'documents',
    id,
    packId: source.packId,
    version: source.version,
    copiedAt: record?.copiedAt ?? doc.ingestedAt ?? new Date(0).toISOString(),
    // Without a recorded hash there is nothing to compare: not marked edited.
    files: file ? [file] : [],
  }
  return copyState(root, own, providingPack(source))
}

/** The project documents with `copy` set on those imported from a pack. */
export async function withDocumentCopyStates(
  root: string,
  docs: readonly DocumentMeta[],
): Promise<(DocumentMeta & { copy?: PackCopyState })[]> {
  if (!docs.some((d) => d.source)) return [...docs]
  const { copies } = await readProjectPacks(root).catch(() => ({ copies: [] }))
  return Promise.all(
    docs.map(async (doc) => {
      const copy = await documentCopyState(root, doc, copies)
      return copy ? { ...doc, copy } : doc
    }),
  )
}
