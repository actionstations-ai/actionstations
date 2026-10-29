// Add a geographic map (#436, FR-9): choose where its map data comes from. Online maps are
// listed even while off, and the map then says how to turn them on.
import { useMemo, useState } from 'react'
import type { MapLayer, BasemapSource } from '@shared/schemas'
import type { StoredArchiveView } from '@shared/ipc'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { newMapId } from '../../state/maps'

interface Choice {
  key: string
  label: string
  source: BasemapSource
}

function choicesFor(archives: StoredArchiveView[]): Choice[] {
  const out: Choice[] = [
    {
      key: 'online',
      label: 'Online map (needs online maps turned on in Settings)',
      source: { kind: 'online', provider: 'openfreemap' },
    },
  ]
  const seen = new Set<string>()
  for (const a of archives) {
    if (a.catalogId) {
      if (seen.has(a.catalogId)) continue
      seen.add(a.catalogId)
      out.push({
        key: a.catalogId,
        label: `${a.title} (state file)`,
        source: { kind: 'catalog', ids: [a.catalogId] },
      })
    } else {
      out.push({
        key: a.sha256,
        label: `${a.title} (${a.kind === 'area' ? 'area download' : 'imported file'})`,
        source: { kind: a.kind === 'area' ? 'area' : 'file', sha256: a.sha256 },
      })
    }
  }
  return out
}

export function AddGeoMapDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  archives: StoredArchiveView[]
  onCreate: (layer: MapLayer) => Promise<void>
}) {
  const choices = useMemo(() => choicesFor(props.archives), [props.archives])
  const [title, setTitle] = useState('')
  const [key, setKey] = useState('online')
  const create = async () => {
    const choice = choices.find((c) => c.key === key) ?? choices[0]!
    try {
      await props.onCreate({
        kind: 'geo',
        id: newMapId('geo'),
        title: title.trim() || 'Map',
        basemap: choice.source,
        style: 'light',
      })
      props.onOpenChange(false)
      setTitle('')
    } catch (e) {
      toast.error('Could not add the map', errorText(e))
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Add a map"
      description="A map shows places by latitude and longitude. You can change where its map data comes from later."
      footer={
        <>
          <Button onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void create()}>
            Add map
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Name">
          {(f) => (
            <input
              id={f.id}
              className="input"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Map data"
          hint="Download state maps, areas or import files in Settings › Maps."
        >
          {(f) => (
            <select
              id={f.id}
              className="input"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            >
              {choices.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </Dialog>
  )
}
