// Export accepted proposals (#431, FR-4): Word plans get a copy with tracked changes, others a
// change memo; the memo can also be written as a PDF. The files go to the folder chosen here.
import { useState } from 'react'
import type { RedlineExportResult } from '@shared/schemas'
import { Button, Dialog } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useJobSettled, useTrackedJob } from '../../state/use-jobs'

export function ExportDialog(props: { projectPath: string; ids: string[]; onClose: () => void }) {
  const [pdf, setPdf] = useState(false)
  const [error, setError] = useState('')
  const [jobId, setJobId] = useState<string | null>(null)
  const [result, setResult] = useState<RedlineExportResult | null>(null)
  const job = useTrackedJob(jobId)
  useJobSettled(
    (j) => j.id === jobId,
    (e, j) => {
      if (e.status === 'done') setResult(j.result as RedlineExportResult)
      else setError(j.error ?? 'The export did not finish.')
    },
  )
  const run = async () => {
    setError('')
    const outDir = await call('dialog:open-directory', { title: 'Where should the files go?' })
    if (!outDir) return
    try {
      const r = await call('redlines:export', {
        projectPath: props.projectPath,
        ids: props.ids,
        outDir,
        formats: pdf ? ['docx', 'pdf'] : ['docx'],
      })
      setJobId(r.jobId)
    } catch (e) {
      setError(errorText(e))
    }
  }
  const busy = !!job && !result && !error && job.status !== 'error'
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      title="Export accepted proposals"
      description="Word plans get a copy with tracked changes you can accept or reject in Word. Other plans, and anything that could not be marked, go into a change memo. Your imported plans are never changed."
      footer={
        <>
          <Button onClick={props.onClose}>{result ? 'Close' : 'Cancel'}</Button>
          {!result && (
            <Button variant="primary" disabled={busy} onClick={() => void run()}>
              {busy ? 'Exporting…' : 'Choose folder and export'}
            </Button>
          )}
        </>
      }
    >
      {!result && (
        <label className="redline-check">
          <input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} />
          <span>Also write the change memo as a PDF</span>
        </label>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div role="status">
          <p>
            Wrote {result.files.length} {result.files.length === 1 ? 'file' : 'files'}.
          </p>
          <ul className="redline-files">
            {result.files.map((f) => (
              <li key={f} className="redline__file">
                {f}
              </li>
            ))}
          </ul>
          <p className="muted">
            {result.perRedline.filter((p) => p.mode === 'tracked').length} marked in the plan,{' '}
            {result.perRedline.filter((p) => p.mode === 'memo').length} in a memo.
          </p>
        </div>
      )}
    </Dialog>
  )
}
