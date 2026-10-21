// Ingest pipeline: copy → parse (worker for PDF) → text.md → chunk → index.replaceDocument.
// Status per document: pending → parsing → embedding → ok | error. Every status change is
// persisted (meta.json + project.json) and announced with project:changed {what:'documents'}.
// A failing document is marked 'error' with its message; the job carries on with the rest.
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import type { DocumentKind, DocumentMeta, Job } from '@shared/schemas'
import { AppError, toAppError } from '../lib/errors'
import { exists } from '../lib/fs'
import { newId, nowIso } from '../lib/ids'
import { jobs, type JobContext } from '../jobs/manager'
import { loadProject } from '../project/store'
import { openIndex, type IndexedDocument, type IndexStore } from '../retrieve'
import { chunkSections } from './chunker'
import { cleanHeadingText, deriveShortName } from './headings'
import { mimeTypeFor, parserKindFor } from './parsers'
import {
  deleteDocumentFolder,
  documentFiles,
  loadMeta,
  mutateMeta,
  readText,
  saveMeta,
  sha256File,
  writeText,
} from './storage'
import { parseTextMd, renderTextMd } from './text-md'
import type { ParsedDocument } from './types'
import { parseDocument } from './worker-host'

const MAX_FILE_BYTES = 512 * 1024 * 1024
const HEADINGS_PREVIEW = 12

type IndexFactory = (root: string) => Promise<IndexStore>
let indexFactory: IndexFactory = openIndex

/** Tests swap in an in-memory IndexStore. */
export function setIndexFactory(factory: IndexFactory | undefined): void {
  indexFactory = factory ?? openIndex
}

/** The project's index store (openIndex unless a test replaced it). */
export const indexFor = (root: string): Promise<IndexStore> => indexFactory(root)

type LazyIndex = () => Promise<IndexStore>

const titleFromFilename = (filename: string) => filename.replace(/\.[^.]+$/, '')

/** Best guess at the document kind from its name; the user can change it. */
export function guessKind(name: string): DocumentKind {
  const n = name.toLowerCase()
  if (/\bmap\b/.test(n)) return 'map'
  if (/\b(ics[-\s]?\d{3}|form)\b/.test(n)) return 'form'
  if (/\b(after[-\s]action|aar|hot\s?wash|exercise|ttx|msel)\b/.test(n)) return 'prior_exercise'
  if (/\b(course|module|lesson|syllabus|training)\b/.test(n)) return 'course'
  if (/\b(policy|policies|program|directive|regulation)\b/.test(n)) return 'policy'
  if (/\b(plan|procedures?|sop|playbook|annex)\b/.test(n)) return 'plan'
  return 'other'
}

/** First distinct headings in document order (shown on the document card). */
export function headingsPreview(doc: ParsedDocument, max = HEADINGS_PREVIEW): string[] {
  const seen = new Set<string>()
  for (const s of doc.sections) {
    for (const h of s.headingPath) {
      seen.add(cleanHeadingText(h))
      if (seen.size >= max) return [...seen]
    }
  }
  return [...seen]
}

function indexedDocument(root: string, meta: DocumentMeta): IndexedDocument {
  return {
    id: meta.id,
    title: meta.title,
    ...(meta.shortName ? { shortName: meta.shortName } : {}),
    kind: meta.kind,
    path: documentFiles(root, meta).originalRel,
    pages: meta.pages,
  }
}

type IngestStage = 'parsing' | 'chunking' | 'embedding' | 'done'

interface Progress {
  ctx: JobContext
  /** The document this range belongs to (one job can cover several imports). */
  documentId: string
  /** Fraction range of the whole job this document covers. */
  from: number
  to: number
}

const report = (p: Progress, share: number, stage: IngestStage, message: string) =>
  p.ctx.progress(p.from + (p.to - p.from) * share, message, { stage, itemId: p.documentId })

async function indexChunks(
  root: string,
  meta: DocumentMeta,
  parsed: ParsedDocument,
  index: LazyIndex,
  progress: Progress,
): Promise<DocumentMeta> {
  const shortName = meta.shortName ?? deriveShortName(meta.title, meta.filename)
  const chunks = chunkSections(parsed.sections, shortName)
  if (!chunks.length)
    throw new AppError('VALIDATION', 'No text could be extracted from this document')
  const embedding = await mutateMeta(root, meta.id, (m) => ({
    ...m,
    status: 'embedding',
    shortName,
  }))
  await (
    await index()
  ).replaceDocument(
    indexedDocument(root, embedding),
    chunks,
    (done, total) =>
      report(
        progress,
        0.4 + 0.6 * (total ? done / total : 1),
        'embedding',
        `Embedding ${embedding.title}`,
      ),
    progress.ctx.signal,
  )
  const done = await mutateMeta(root, meta.id, (m) => ({
    ...m,
    status: 'ok',
    error: undefined,
    chunkCount: chunks.length,
    headingsPreview: headingsPreview(parsed),
    ingestedAt: nowIso(),
  }))
  report(progress, 1, 'done', `Indexed ${done.title}`)
  return done
}

/** Full ingest of one document from its stored original. */
async function ingestOne(
  root: string,
  id: string,
  index: LazyIndex,
  progress: Progress,
): Promise<void> {
  const start = await mutateMeta(root, id, (m) => ({ ...m, status: 'parsing', error: undefined }))
  report(progress, 0.05, 'parsing', `Parsing ${start.filename}`)
  const files = documentFiles(root, start)
  const parsed = await parseDocument(files.original, start.filename, progress.ctx.signal)
  progress.ctx.throwIfCancelled()
  const meta = await mutateMeta(root, id, (m) => {
    const untouched = !m.ingestedAt && m.title === titleFromFilename(m.filename)
    const title = untouched ? parsed.title : m.title
    return {
      ...m,
      title,
      shortName: m.shortName ?? deriveShortName(title, m.filename),
      pages: parsed.pages,
      headingsPreview: headingsPreview(parsed),
    }
  })
  await writeText(root, meta, renderTextMd(parsed))
  report(progress, 0.4, 'chunking', `Chunking ${meta.title}`)
  await indexChunks(root, meta, parsed, index, progress)
}

/** Re-chunk one document from text.md (no re-parse). */
async function rechunkOne(
  root: string,
  id: string,
  index: LazyIndex,
  progress: Progress,
): Promise<void> {
  const meta = await loadMeta(root, id)
  const parsed = parseTextMd(await readText(root, meta), meta.title)
  report(progress, 0.2, 'chunking', `Chunking ${meta.title}`)
  await indexChunks(root, meta, { ...parsed, pages: meta.pages }, index, progress)
}

async function markFailed(root: string, id: string, err: unknown, ctx: JobContext): Promise<void> {
  const e = toAppError(err)
  const message = e.code === 'CANCELLED' ? 'Cancelled' : e.message
  ctx.log(`${id}: ${message}`, 'error', { itemId: id })
  await mutateMeta(root, id, (m) => ({ ...m, status: 'error', error: message })).catch(
    () => undefined,
  )
}

type Mode = 'ingest' | 'rechunk' | 'auto'

async function processDocument(
  root: string,
  id: string,
  mode: Mode,
  index: LazyIndex,
  progress: Progress,
): Promise<void> {
  if (mode === 'ingest') return ingestOne(root, id, index, progress)
  if (mode === 'rechunk') return rechunkOne(root, id, index, progress)
  const meta = await loadMeta(root, id)
  const hasText = await exists(documentFiles(root, meta).text)
  return hasText ? rechunkOne(root, id, index, progress) : ingestOne(root, id, index, progress)
}

interface RunSummary {
  ok: string[]
  failed: string[]
}

async function runBatch(
  root: string,
  ids: string[],
  mode: Mode,
  ctx: JobContext,
  opts: { reset?: boolean } = {},
): Promise<RunSummary> {
  const summary: RunSummary = { ok: [], failed: [] }
  if (!ids.length && !opts.reset) return summary
  // Opened on first use: parsing and text.md still happen when the index is unavailable,
  // so a later index:rebuild can re-chunk without re-parsing.
  let opened: Promise<IndexStore> | undefined
  const index: LazyIndex = () => (opened ??= indexFactory(root))
  if (opts.reset) await (await index()).reset()
  for (const [i, id] of ids.entries()) {
    const progress = { ctx, documentId: id, from: i / ids.length, to: (i + 1) / ids.length }
    try {
      ctx.throwIfCancelled()
      await processDocument(root, id, mode, index, progress)
      summary.ok.push(id)
    } catch (err) {
      await markFailed(root, id, err, ctx)
      summary.failed.push(id)
    }
  }
  return summary
}

export function startIngestJob(
  root: string,
  ids: string[],
  mode: Mode = 'ingest',
  opts: { reset?: boolean } = {},
): Job {
  return jobs.start('ingest', (ctx) => runBatch(root, ids, mode, ctx, opts), {
    projectPath: root,
    payload: { documentIds: ids, mode },
  })
}

async function validateSource(filePath: string): Promise<void> {
  parserKindFor(filePath)
  let stat
  try {
    stat = await fs.stat(filePath)
  } catch {
    throw new AppError('NOT_FOUND', `File not found: ${filePath}`)
  }
  if (!stat.isFile()) throw new AppError('VALIDATION', `Not a file: ${filePath}`)
  if (stat.size > MAX_FILE_BYTES)
    throw new AppError('VALIDATION', `File is too large (max 512 MB): ${filePath}`)
}

/** Copy a new file into the project; identical content (sha256) returns the existing document. */
async function addDocument(
  root: string,
  filePath: string,
  known: Map<string, DocumentMeta>,
): Promise<{ meta: DocumentMeta; isNew: boolean }> {
  const sha256 = await sha256File(filePath)
  const existing = known.get(sha256)
  if (existing) return { meta: existing, isNew: false }
  const filename = basename(filePath)
  const meta: DocumentMeta = {
    id: newId(),
    title: titleFromFilename(filename),
    filename,
    mimeType: mimeTypeFor(filePath),
    kind: guessKind(filename),
    pages: 0,
    status: 'pending',
    tags: [],
    headingsPreview: [],
    sha256,
    chunkCount: 0,
  }
  const files = documentFiles(root, meta)
  await fs.mkdir(files.dir, { recursive: true })
  await fs.copyFile(filePath, files.original)
  const saved = await saveMeta(root, meta)
  known.set(sha256, saved)
  return { meta: saved, isNew: true }
}

export async function importDocuments(
  root: string,
  filePaths: string[],
): Promise<{ jobId: string; documents: DocumentMeta[] }> {
  for (const p of filePaths) await validateSource(p)
  const project = await loadProject(root)
  const known = new Map(project.documents.filter((d) => d.sha256).map((d) => [d.sha256!, d]))
  const added: { meta: DocumentMeta; isNew: boolean }[] = []
  for (const p of filePaths) added.push(await addDocument(root, p, known))
  const fresh = added.filter((a) => a.isNew).map((a) => a.meta.id)
  const job = startIngestJob(root, fresh)
  return { jobId: job.id, documents: added.map((a) => a.meta) }
}

export async function removeDocument(root: string, documentId: string): Promise<void> {
  await loadMeta(root, documentId)
  try {
    const index = await indexFactory(root)
    await index.removeDocument(documentId)
  } catch (err) {
    // The folder is the source of truth; stale index rows go away on the next rebuild.
    if (toAppError(err).code !== 'NOT_IMPLEMENTED')
      console.warn('[ingest] index removal failed:', err)
  }
  await deleteDocumentFolder(root, documentId)
}

export async function reingestDocument(root: string, documentId: string): Promise<Job> {
  const meta = await loadMeta(root, documentId)
  if (!(await exists(documentFiles(root, meta).original))) {
    throw new AppError('NOT_FOUND', `The original file for ${meta.title} is missing`)
  }
  return startIngestJob(root, [documentId], 'ingest')
}

export async function rebuildIndex(root: string): Promise<Job> {
  const project = await loadProject(root)
  return startIngestJob(
    root,
    project.documents.map((d) => d.id),
    'auto',
    { reset: true },
  )
}

export interface DocumentPatch {
  title?: string
  shortName?: string
  kind?: DocumentKind
  tags?: string[]
}

/** Edit metadata; a new title/shortName/kind re-chunks from text.md so citations follow. */
export async function updateDocument(
  root: string,
  documentId: string,
  patch: DocumentPatch,
): Promise<DocumentMeta> {
  const before = await loadMeta(root, documentId)
  const next = await mutateMeta(root, documentId, (m) => ({
    ...m,
    ...(patch.title !== undefined ? { title: patch.title.trim() || m.title } : {}),
    ...(patch.shortName !== undefined ? { shortName: patch.shortName.trim() || undefined } : {}),
    ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
    ...(patch.tags !== undefined
      ? { tags: [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))] }
      : {}),
  }))
  const citationChanged =
    next.title !== before.title || next.shortName !== before.shortName || next.kind !== before.kind
  if (citationChanged && before.status === 'ok' && (await exists(documentFiles(root, next).text))) {
    startIngestJob(root, [documentId], 'rechunk')
  }
  return next
}
