// Reference documents from installed packs (ADR-0018, #265) and from the enabled packs included
// with the app (ADR-0020). Listing reads manifest.documents of those packs; importing resolves each chosen file inside userData/packs with packFilePath
// (realpath-guarded, listed in pack.json only), hands it to the normal ingest pipeline with the
// pack title, source and license, and records the copy in <project>/packs.json.
//
// The packs.json record (kind 'documents', id = <packId>/<slug>, so two packs with the same
// group slug import side by side) lists the imported originals
// (documents/<docId>/original.<ext>) with their sha256, so copyState can tell an edited or
// removed copy and an update in the pack. The copy is the project's own: uninstalling or
// updating the pack changes nothing in the project.
import type { DocumentMeta } from '@shared/schemas'
import type { PackDocumentRef, PackDocumentView } from '@shared/ipc/pack-documents'
import { AppError } from '../lib/errors'
import { exists } from '../lib/fs'
import { loadProject } from '../project/store'
import { contentPacks, packById, packFilePath, type InstalledPack } from '../packs/layers'
import { copyPackItem, copyPath, findCopy, forgetCopy } from '../packs/project-copies'
import { importSources, type ImportSource } from './pipeline'
import { documentFiles } from './storage'

/** documents/<slug>/<file> → slug. */
const slugOf = (path: string): string => path.split('/')[1] ?? ''

const importedKey = (packId: string, path: string) => `${packId}\u0000${path}`

/**
 * Every document file of the enabled installed and bundled packs; with project documents,
 * marks the imported ones.
 */
export function listPackDocuments(projectDocs: readonly DocumentMeta[] = []): PackDocumentView[] {
  const imported = new Map(
    projectDocs
      .filter((d) => d.source)
      .map((d) => [importedKey(d.source!.packId, d.source!.path), d.id]),
  )
  return contentPacks().flatMap((pack) =>
    [...pack.manifest.documents]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((d) => {
        const importedDocumentId = imported.get(importedKey(pack.id, d.path))
        return {
          packId: pack.id,
          packVersion: pack.version,
          packName: pack.name,
          ...(pack.bundled ? { bundled: true } : {}),
          slug: slugOf(d.path),
          path: d.path,
          title: d.title,
          ...(d.source ? { source: d.source } : {}),
          license: d.license,
          ...(d.description ? { description: d.description } : {}),
          ...(importedDocumentId ? { importedDocumentId } : {}),
        }
      }),
  )
}

interface ResolvedRef {
  pack: InstalledPack
  path: string
  slug: string
  source: ImportSource
}

function resolveRef(ref: PackDocumentRef): ResolvedRef {
  const pack = packById(ref.packId)
  if (!pack) throw new AppError('NOT_FOUND', `Pack ${ref.packId} is not installed or is disabled`)
  const entry = pack.manifest.documents.find((d) => d.path === ref.path)
  if (!entry) throw new AppError('NOT_FOUND', `${pack.name} has no document ${ref.path}`)
  return {
    pack,
    path: ref.path,
    slug: slugOf(ref.path),
    source: {
      path: packFilePath(pack, ref.path),
      meta: {
        title: entry.title,
        license: entry.license,
        source: { packId: pack.id, version: pack.version, path: ref.path, packName: pack.name },
      },
    },
  }
}

/** packs.json id of a pack's document group: documents are always addressed with their pack. */
export const documentCopyId = (packId: string, slug: string): string => `${packId}/${slug}`

/** Record one slug's imported files in packs.json, keeping the files imported earlier. */
async function recordCopy(
  root: string,
  pack: InstalledPack,
  slug: string,
  docs: readonly { from: string; meta: DocumentMeta }[],
): Promise<void> {
  const id = documentCopyId(pack.id, slug)
  const files = new Map<string, string>()
  const previous = await findCopy(root, 'documents', id)
  if (previous)
    for (const f of previous.files) {
      // packs.json is not trusted: a path outside documents/<docId>/ or through a link is dropped.
      const abs = await copyPath(root, 'documents', id, f.path).catch(() => undefined)
      if (abs && (await exists(abs))) files.set(f.path, abs)
    }
  for (const d of docs) files.set(documentFiles(root, d.meta).originalRel, d.from)
  // Re-recorded from scratch: removed documents drop out instead of reading as "edited".
  await forgetCopy(root, 'documents', id)
  await copyPackItem(root, {
    pack: { id: pack.id, version: pack.version, name: pack.name },
    kind: 'documents',
    id,
    files: [...files].map(([to, from]) => ({ from, to })),
  })
}

/** Copy pack documents into the project, start the ingest job and record the copies. */
export async function importPackDocuments(
  root: string,
  refs: readonly PackDocumentRef[],
): Promise<{ jobId: string; documents: DocumentMeta[] }> {
  const resolved = refs.map(resolveRef)
  const result = await importSources(
    root,
    resolved.map((r) => r.source),
  )
  const groups = new Map<
    string,
    { pack: InstalledPack; slug: string; docs: { from: string; meta: DocumentMeta }[] }
  >()
  for (const [i, r] of resolved.entries()) {
    const meta = result.documents[i]!
    // Same bytes already in the project as the user's own document: not a pack copy.
    if (meta.source?.packId !== r.pack.id) continue
    const key = importedKey(r.pack.id, r.slug)
    const group = groups.get(key) ?? { pack: r.pack, slug: r.slug, docs: [] }
    group.docs.push({ from: r.source.path, meta })
    groups.set(key, group)
  }
  for (const g of groups.values()) await recordCopy(root, g.pack, g.slug, g.docs)
  return result
}

/** The project documents, for marking imported pack files in the list. */
export const projectDocuments = async (root: string): Promise<DocumentMeta[]> =>
  (await loadProject(root)).documents
