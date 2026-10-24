// Download an archive (catalog entry or pasted URL) as a job, then open its review (#268).
// The download only stages the archive; installing still waits for the review's button.
import { useCallback } from 'react'
import type { PackDownloadRequest, PackDownloadResult } from '@shared/ipc'
import type { JobDoneEvent } from '@shared/schemas/job'
import { call } from '../../lib/api'
import { toast } from '../../components/toast-store'
import { useJob } from '../generate/use-job'
import { trackJob } from '../../state/jobs'
import { usePackReview } from './review-store'

export function usePackDownload() {
  const download = usePackReview((s) => s.download)

  const onDone = useCallback((e: JobDoneEvent) => {
    const store = usePackReview.getState()
    const current = store.download
    store.endDownload()
    if (e.status === 'done' && current) {
      const result = e.result as PackDownloadResult
      store.review({ downloadedPath: result.path, source: current.source })
    } else if (e.status === 'error') {
      toast.error('Could not download the pack', e.error)
    }
  }, [])
  const job = useJob(download?.jobId ?? null, onDone)

  const start = useCallback(async (req: PackDownloadRequest, label: string) => {
    const source =
      req.source === 'catalog'
        ? ({ kind: 'catalog', url: req.catalogUrl } as const)
        : ({ kind: 'url', url: req.url } as const)
    try {
      const { jobId } = await call('packs:download', req)
      trackJob(jobId, { kind: 'pack-download' })
      usePackReview.getState().startDownload({ jobId, source, label })
    } catch (err) {
      toast.error('Could not start the download', err)
    }
  }, [])

  return { download, job, start }
}
