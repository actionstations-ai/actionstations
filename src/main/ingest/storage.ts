// Document folder: documents/<docId>/{original.<ext>, text.md, meta.json}.
// meta.json is the per-document source of truth; project.json documents[] is a denormalized copy.
import { createHash } from 'node:crypto'
import { createReadStream, promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { DocumentMeta } from '@shared/schemas'
import { emit } from '../lib/events'
import { AppError } from '../lib/errors'
import { exists, readJson, safeJoin, toRel, writeFileAtomic, writeJsonAtomic } from '../lib/fs'
import { loadProject, projectPaths, updateProject } from '../project/store'

export const TEXT_FILE = 'text.md'
export const META_FILE = 'meta.json'

export const documentFiles = (root: string, doc: Pick<DocumentMeta, 'id' | 'filename'>) => {
  const dir = projectPaths(root).document(doc.id)
  const ext = extname(doc.filename).toLowerCase()
  const original = safeJoin(dir, `original${ext}`)
  return {
    dir,
    original,
    /** Project-relative POSIX path of the original (IndexedDocument.path). */
    originalRel: toRel(root, original),
    text: safeJoin(dir, TEXT_FILE),
    meta: safeJoin(dir, META_FILE),
  }
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

const metaLocks = new Map<string, Promise<unknown>>()

/**
 * Read-modify-write one document's meta, serialized per document so an ingest job's status
 * updates never clobber a concurrent rename from the UI.
 */
export async function mutateMeta(
  root: string,
  documentId: string,
  mutate: (meta: DocumentMeta) => DocumentMeta,
): Promise<DocumentMeta> {
  const key = `${root}\u0000${documentId}`
  const prev = metaLocks.get(key) ?? Promise.resolve()
  const run = prev
    .catch(() => undefined)
    .then(async () => saveMeta(root, mutate(await loadMeta(root, documentId))))
  metaLocks.set(key, run)
  try {
    return await run
  } finally {
    if (metaLocks.get(key) === run) metaLocks.delete(key)
  }
}

/** Write meta.json, mirror it into project.json and tell the renderer. */
export async function saveMeta(root: string, meta: DocumentMeta): Promise<DocumentMeta> {
  const parsed = DocumentMeta.parse(meta)
  await writeJsonAtomic(documentFiles(root, parsed).meta, parsed)
  await updateProject(root, (p) => {
    const i = p.documents.findIndex((d) => d.id === parsed.id)
    if (i >= 0) p.documents[i] = parsed
    else p.documents.push(parsed)
  })
  emit('project:changed', { path: root, what: 'documents' })
  return parsed
}

export async function loadMeta(root: string, documentId: string): Promise<DocumentMeta> {
  const metaPath = safeJoin(projectPaths(root).document(documentId), META_FILE)
  if (await exists(metaPath)) return readJson(metaPath, DocumentMeta)
  // Older or hand-edited projects may only have the project.json entry.
  const entry = (await loadProject(root)).documents.find((d) => d.id === documentId)
  if (!entry) throw new AppError('NOT_FOUND', `No document ${documentId}`)
  return entry
}

export async function writeText(root: string, meta: DocumentMeta, text: string): Promise<void> {
  await writeFileAtomic(documentFiles(root, meta).text, text)
}

export async function readText(root: string, meta: DocumentMeta): Promise<string> {
  const path = documentFiles(root, meta).text
  try {
    return await fs.readFile(path, 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AppError('NOT_FOUND', `No extracted text yet for ${meta.title}`)
    }
    throw e
  }
}

export async function deleteDocumentFolder(root: string, documentId: string): Promise<void> {
  await fs.rm(projectPaths(root).document(documentId), { recursive: true, force: true })
  await updateProject(root, (p) => {
    p.documents = p.documents.filter((d) => d.id !== documentId)
  })
  emit('project:changed', { path: root, what: 'documents' })
}
