// Import an infrastructure layer from a file on this computer (#439 FR-10). The public HIFLD
// portal is offline, so layers come from an archive or the original publisher. The file is read
// and filtered here; nothing is sent anywhere.
import { useState } from 'react'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient } from '../../lib/query'

export function ImportLayerDialog(props: {
  projectPath: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: (snapshotId: string) => void
}) {
  const [file, setFile] = useState('')
  const [layer, setLayer] = useState('')
  const [source, setSource] = useState('')
  const [radius, setRadius] = useState(50)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const choose = async () => {
    const picked = await call('dialog:open-files', {
      title: 'Choose a layer file',
      filters: [{ name: 'GeoJSON or CSV', extensions: ['geojson', 'json', 'csv'] }],
      multi: false,
    })
    if (picked[0]) setFile(picked[0])
  }
  const run = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const snap = await call('hazards:import-layer', {
        projectPath: props.projectPath,
        file,
        layer,
        source,
        radiusKm: radius,
      })
      await queryClient.invalidateQueries({ queryKey: ['hazards:list'] })
      toast.success('Layer imported', `${layer} was added to the snapshot.`)
      props.onDone(snap.id)
      props.onOpenChange(false)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !busy && props.onOpenChange(o)}
      title="Import an infrastructure layer"
      description="Choose a GeoJSON or CSV file you downloaded, for example a hospitals layer from an archive of the HIFLD data. It is read on this computer and filtered to your area. Nothing is sent anywhere."
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !file || !layer.trim() || !source.trim()}
            onClick={() => void run()}
          >
            {busy ? 'Importing…' : 'Import'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="row">
          <Button onClick={() => void choose()}>Choose file…</Button>
          <span>{file ? file : 'No file chosen'}</span>
        </div>
        <Field label="Layer name" hint="For example, Hospitals.">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              value={layer}
              {...(describedBy ? { 'aria-describedby': describedBy } : {})}
              onChange={(e) => setLayer(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Where the file came from"
          hint="Kept with the layer, for example: HIFLD archive, Hospitals, DataLumos copy of 2025-08."
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              value={source}
              {...(describedBy ? { 'aria-describedby': describedBy } : {})}
              onChange={(e) => setSource(e.target.value)}
            />
          )}
        </Field>
        <Field label="Keep features within (km)">
          {({ id }) => (
            <input
              id={id}
              className="input"
              type="number"
              min={1}
              max={500}
              value={radius}
              onChange={(e) => setRadius(Math.min(500, Math.max(1, Number(e.target.value) || 50)))}
            />
          )}
        </Field>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
