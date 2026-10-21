import { useCallback } from 'react'
import type { DocumentMeta } from '@shared/schemas/project'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcMutation } from '../../lib/query'
import type { DocumentPatch } from './DocumentRow'
import { IMPORT_FILTERS } from './doc-utils'
import { INDEX_TARGET } from './job-progress'

type Track = (jobId: string, targets: string[]) => void

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Import from the file picker or from dropped paths; tracks the returned ingest job. */
export function useImportDocuments(projectPath: string, track: Track) {
  const importDocs = useIpcMutation('documents:import', { invalidates: ['documents:list'] })
  const { mutateAsync } = importDocs
  const importPaths = useCallback(
    async (filePaths: string[]) => {
      try {
        const res = await mutateAsync({ projectPath, filePaths })
        track(
          res.jobId,
          res.documents.map((d) => d.id),
        )
        toast.info(`Importing ${plural(res.documents.length, 'document')}`)
      } catch (err) {
        toast.error('Import failed', err)
      }
    },
    [mutateAsync, projectPath, track],
  )
  const pickFiles = useCallback(async () => {
    let paths: string[]
    try {
      paths = await call('dialog:open-files', {
        title: 'Import documents',
        filters: IMPORT_FILTERS,
        multi: true,
      })
    } catch (err) {
      toast.error('Could not open the file picker', err)
      return
    }
    if (paths.length) await importPaths(paths)
  }, [importPaths])
  return { importPaths, pickFiles, importing: importDocs.isPending }
}

/** Per-document edits plus the project-wide index rebuild. */
export function useDocumentActions(projectPath: string, track: Track) {
  const update = useIpcMutation('documents:update', { invalidates: ['documents:list'] })
  const remove = useIpcMutation('documents:remove', { invalidates: ['documents:list'] })
  const reingest = useIpcMutation('documents:reingest', { invalidates: ['documents:list'] })
  const rebuild = useIpcMutation('index:rebuild')
  return {
    patch: (doc: DocumentMeta, patch: DocumentPatch) =>
      update
        .mutateAsync({ projectPath, documentId: doc.id, patch })
        .catch((err) => toast.error('Could not save the change', err)),
    retry: (doc: DocumentMeta) =>
      reingest
        .mutateAsync({ projectPath, documentId: doc.id })
        .then((r) => track(r.jobId, [doc.id]))
        .catch((err) => toast.error('Could not restart ingest', err)),
    remove: (doc: DocumentMeta) =>
      remove
        .mutateAsync({ projectPath, documentId: doc.id })
        .then(() => toast.success(`Removed ${doc.title}`))
        .catch((err) => toast.error('Could not remove the document', err)),
    rebuildIndex: () =>
      rebuild
        .mutateAsync({ projectPath })
        .then((r) => track(r.jobId, [INDEX_TARGET]))
        .catch((err) => toast.error('Could not rebuild the index', err)),
  }
}
