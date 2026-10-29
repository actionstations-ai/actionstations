// Export the improvement plan, the IPP schedule, or the whole program as a ZIP (FR-12).
import { useState } from 'react'
import type { ProgramExportTarget } from '@shared/ipc'
import { Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'

const OPTIONS: { id: ProgramExportTarget; label: string; group: 'ip' | 'ipp' | 'zip' }[] = [
  { id: 'ip_docx', label: 'Improvement Plan, Word', group: 'ip' },
  { id: 'ip_pdf', label: 'Improvement Plan, PDF', group: 'ip' },
  { id: 'ip_csv', label: 'Improvement Plan, CSV (opens in a spreadsheet)', group: 'ip' },
  { id: 'ipp_docx', label: 'Schedule, Word', group: 'ipp' },
  { id: 'ipp_pdf', label: 'Schedule, PDF', group: 'ipp' },
  { id: 'ipp_csv', label: 'Schedule, CSV', group: 'ipp' },
  { id: 'zip', label: 'Program files for hand-off, ZIP', group: 'zip' },
]

export function ExportDialog(props: {
  programPath: string
  focus: 'ip' | 'ipp'
  onClose: () => void
}) {
  const [picked, setPicked] = useState<ProgramExportTarget[]>([
    props.focus === 'ip' ? 'ip_docx' : 'ipp_docx',
  ])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const toggle = (id: ProgramExportTarget) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const run = async () => {
    if (!picked.length) return setError('Choose at least one file.')
    const outDir = await call('dialog:open-directory', { title: 'Where should the files go?' })
    if (!outDir) return
    setBusy(true)
    try {
      const { files } = await call('program:export', {
        programPath: props.programPath,
        outDir,
        targets: picked,
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
      title="Export"
      description="The files include owner names and emails you typed. They are written to the folder you choose and go nowhere else."
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
        {OPTIONS.map((o) => (
          <label key={o.id} className="row">
            <input type="checkbox" checked={picked.includes(o.id)} onChange={() => toggle(o.id)} />
            <span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </Dialog>
  )
}
