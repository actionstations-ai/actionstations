// Import an existing corrective-action list from a CSV file (#504). The file is read here and
// sent to main, which checks every row; the preview shows what will be created, skipped or
// refused before anything is written.
import { useState } from 'react'
import type { CsvImportPreview } from '@shared/ipc'
import { CORRECTIVE_ACTION_STATUS_LABELS } from '@shared/schemas'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { refreshProgramQueries } from '../../state/program'
import { tallyRows } from './csv-import-rows'

const MAX_BYTES = 1_000_000

function PreviewTable({ preview }: { preview: CsvImportPreview }) {
  const t = tallyRows(preview.rows)
  return (
    <div className="stack">
      <p role="status">
        {t.create} to create, {t.duplicates} already in the program, {t.refused} that cannot be
        imported.
      </p>
      {preview.ignoredColumns.length > 0 && (
        <p className="muted">Columns not used: {preview.ignoredColumns.join(', ')}.</p>
      )}
      <table className="program-table">
        <caption className="sr-only">Rows found in the file</caption>
        <thead>
          <tr>
            <th scope="col">Line</th>
            <th scope="col">Title</th>
            <th scope="col">Status</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {preview.rows.map((r) => (
            <tr key={r.line}>
              <td>{r.line}</td>
              <td>{r.title || '(none)'}</td>
              <td>{CORRECTIVE_ACTION_STATUS_LABELS[r.status]}</td>
              <td>
                {r.error ? (
                  <span className="field__error">Not imported: {r.error}</span>
                ) : r.duplicate ? (
                  'Already in the program'
                ) : (
                  'Will be created'
                )}
                {r.warnings.map((w) => (
                  <span key={w} className="muted">
                    {' '}
                    {w}.
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function CsvImportDialog(props: { programPath: string; onClose: () => void }) {
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<CsvImportPreview>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const choose = async (file: File | undefined) => {
    setPreview(undefined)
    setError('')
    if (!file) return
    if (file.size > MAX_BYTES) return setError('That file is larger than 1 MB.')
    setBusy(true)
    try {
      const text = await file.text()
      setCsv(text)
      setPreview(
        await call('program:import-csv-preview', { programPath: props.programPath, csv: text }),
      )
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const run = async () => {
    setBusy(true)
    try {
      const done = await call('program:import-csv', { programPath: props.programPath, csv })
      refreshProgramQueries()
      toast.success(`Imported ${done.created} corrective action(s)`, `${done.skipped} skipped.`)
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const canImport = !!preview && tallyRows(preview.rows).create > 0 && !busy
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onClose()}
      className="dialog--wide"
      title="Import corrective actions from CSV"
      description="Choose a CSV file with a header row. Columns are matched by name: Title or Corrective Action, Issue/Area for Improvement, Core Capability, Capability Element, Primary Responsible Organization, Organization POC, Email, Start Date, Completion Date, Status, Priority, Notes. Nothing is created until you press Import."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!canImport} onClick={() => void run()}>
            Import
          </Button>
        </>
      }
    >
      <Field label="CSV file" {...(error ? { error } : {})}>
        {({ id, describedBy }) => (
          <input
            id={id}
            type="file"
            accept=".csv,text/csv"
            aria-describedby={describedBy}
            disabled={busy}
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        )}
      </Field>
      {preview && <PreviewTable preview={preview} />}
    </Dialog>
  )
}
