// Documents left mid-import (#309). An app exit during an ingest job leaves a document at
// pending / parsing / embedding with nothing working on it, and the Documents row offers no
// Retry for that. When a project opens or its documents are listed, such a document becomes
// 'error' ("Import interrupted — retry") unless a live ingest job in this process still
// covers it, so Retry (documents:reingest) picks it up again.
import { resolve } from 'node:path'
import type { DocumentMeta, Job } from '@shared/schemas'
import { jobs } from '../jobs/manager'
import { mutateMeta } from './storage'

export const INTERRUPTED_MESSAGE = 'Import interrupted — retry'

const BUSY: readonly DocumentMeta['status'][] = ['pending', 'parsing', 'embedding']

/** Imports that have saved documents but not yet started their job, per project root. */
const importsInFlight = new Map<string, number>()

/** Wrap the window between saving a new document and starting its ingest job. */
export async function withImportInFlight<T>(root: string, run: () => Promise<T>): Promise<T> {
  const key = resolve(root)
  importsInFlight.set(key, (importsInFlight.get(key) ?? 0) + 1)
  try {
    return await run()
  } finally {
    const left = (importsInFlight.get(key) ?? 1) - 1
    if (left > 0) importsInFlight.set(key, left)
    else importsInFlight.delete(key)
  }
}

/** Ids covered by queued/running ingest jobs for the project; 'all' when one has no id list. */
function liveDocumentIds(root: string): Set<string> | 'all' {
  if (importsInFlight.has(resolve(root))) return 'all'
  const ids = new Set<string>()
  const live = jobs
    .list()
    .filter(
      (j: Job) =>
        j.kind === 'ingest' &&
        (j.status === 'queued' || j.status === 'running') &&
        !!j.projectPath &&
        resolve(j.projectPath) === resolve(root),
    )
  for (const job of live) {
    const docIds = (job.payload as { documentIds?: unknown } | undefined)?.documentIds
    if (!Array.isArray(docIds)) return 'all'
    for (const id of docIds) if (typeof id === 'string') ids.add(id)
  }
  return ids
}

const isOrphaned = (doc: DocumentMeta, root: string): boolean => {
  if (!BUSY.includes(doc.status)) return false
  const live = liveDocumentIds(root)
  return live !== 'all' && !live.has(doc.id)
}

/**
 * Mark busy documents with no live ingest job as 'error'. Returns the list with the changed
 * documents replaced. The check runs again under the document's meta lock, so a job that
 * started in the meantime keeps its document.
 */
export async function markInterruptedDocuments(
  root: string,
  documents: readonly DocumentMeta[],
): Promise<DocumentMeta[]> {
  const out: DocumentMeta[] = []
  for (const doc of documents) {
    if (!isOrphaned(doc, root)) {
      out.push(doc)
      continue
    }
    try {
      out.push(
        await mutateMeta(root, doc.id, (m) =>
          isOrphaned(m, root) ? { ...m, status: 'error', error: INTERRUPTED_MESSAGE } : m,
        ),
      )
    } catch (err) {
      console.warn(`[ingest] could not mark ${doc.id} as interrupted:`, err)
      out.push(doc)
    }
  }
  return out
}
