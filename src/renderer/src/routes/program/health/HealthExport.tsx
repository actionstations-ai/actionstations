// Export the health report as a dated PDF and/or a ZIP of CSV files (FR-11). Owner names are
// included by default (inside the agency's own folder) with an option to leave them out (NFR-2).
import { useState } from 'react'
import type { HealthFilter } from '@shared/schemas'
import { Button, Dialog } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { call } from '../../../lib/api'
import { errorText } from '../../../lib/errors'

export function HealthExport(props: {
  programPath: string
  filter: HealthFilter
  onClose: () => void
}) {
  const [pdf, setPdf] = useState(true)
  const [csv, setCsv] = useState(true)
  const [owners, setOwners] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    const targets = [
      ...(pdf ? (['health_pdf'] as const) : []),
      ...(csv ? (['health_csv'] as const) : []),
    ]
    if (!targets.length) return setError('Choose at least one file.')
    const outDir = await call('dialog:open-directory', { title: 'Where should the files go?' })
    if (!outDir) return
    setBusy(true)
    try {
      const { files } = await call('program:export', {
        programPath: props.programPath,
        outDir,
        targets: [...targets],
        filter: { ...props.filter, includeOwners: owners },
      })
      toast.success(`Exported ${files.length} ${files.length === 1 ? 'file' : 'files'}`, outDir)
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      title="Export the health report"
      description="The files use the filters you have set now. They are written to the folder you choose and go nowhere else."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void run()}>
            {busy ? 'Exporting…' : 'Choose folder and export'}
          </Button>
        </>
      }
    >
      <fieldset className="stack program-export">
        <legend className="field__label">Files to write</legend>
        <label className="row">
          <input type="checkbox" checked={pdf} onChange={(e) => setPdf(e.target.checked)} />
          <span>Report, PDF</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={csv} onChange={(e) => setCsv(e.target.checked)} />
          <span>The tables behind it, CSV files in a ZIP</span>
        </label>
        <label className="row">
          <input type="checkbox" checked={!owners} onChange={(e) => setOwners(!e.target.checked)} />
          <span>Leave out owner names (for sharing outside the agency)</span>
        </label>
      </fieldset>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}
