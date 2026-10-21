// Document ingestion handlers (#11, #12). retrieve:search and embeddings:* live with retrieval.
import { defineHandlers } from '../registry'
import { requireProject } from '../../project/guard'
import { loadProject } from '../../project/store'
import {
  importDocuments,
  indexFor,
  rebuildIndex,
  reingestDocument,
  removeDocument,
  updateDocument,
} from '../../ingest/pipeline'
import { loadMeta, readText } from '../../ingest/storage'

export default defineHandlers({
  'documents:import': async ({ projectPath, filePaths }) => {
    const root = await requireProject(projectPath)
    return importDocuments(root, filePaths)
  },
  'documents:list': async ({ projectPath }) => {
    const root = await requireProject(projectPath)
    return (await loadProject(root)).documents
  },
  'documents:update': async ({ projectPath, documentId, patch }) => {
    const root = await requireProject(projectPath)
    return updateDocument(root, documentId, patch)
  },
  'documents:remove': async ({ projectPath, documentId }) => {
    const root = await requireProject(projectPath)
    await removeDocument(root, documentId)
  },
  'documents:reingest': async ({ projectPath, documentId }) => {
    const root = await requireProject(projectPath)
    return { jobId: (await reingestDocument(root, documentId)).id }
  },
  'documents:chunks': async ({ projectPath, documentId, limit, offset }) => {
    const root = await requireProject(projectPath)
    await loadMeta(root, documentId)
    return (await indexFor(root)).chunks(documentId, limit, offset)
  },
  'documents:text': async ({ projectPath, documentId }) => {
    const root = await requireProject(projectPath)
    return readText(root, await loadMeta(root, documentId))
  },
  'index:rebuild': async ({ projectPath }) => {
    const root = await requireProject(projectPath)
    return { jobId: (await rebuildIndex(root)).id }
  },
})
