// "Places" for one MSEL row (#500, spec 0436 FR-5): which of the project's places the row happens
// at, up to five. The picked places show on the Facilitate map and in the exports' Locations pages.
import { useState } from 'react'
import { Link } from 'react-router'
import type { MselRow } from '@shared/schemas/scenario'
import { MAX_ROW_PLACES } from '@shared/maps/pins'
import { Button, Dialog } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import './places-dialog.css'

interface Props {
  projectPath: string
  row: MselRow | null
  onCancel: () => void
  onSave: (placeIds: string[]) => void
}

export function PlacesDialog(props: Props) {
  // Keyed by row so the ticks start from that row's places each time the dialog opens.
  return props.row ? <OpenPlacesDialog key={props.row.id} {...props} row={props.row} /> : null
}

function OpenPlacesDialog(props: Props & { row: MselRow }) {
  const { row } = props
  const maps = useIpcQuery('maps:get', { projectPath: props.projectPath })
  const [picked, setPicked] = useState<string[]>(() => row.placeIds ?? [])
  const places = maps.data?.maps.places ?? []
  const full = picked.length >= MAX_ROW_PLACES
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && props.onCancel()}
      title={`Places for ${row.id}`}
      description={`Where this inject happens. Pick up to ${MAX_ROW_PLACES}; Facilitate shows the row at these places on the map.`}
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => props.onSave(picked)} disabled={!maps.data}>
            Save
          </Button>
        </>
      }
    >
      {maps.isLoading && <p className="muted">Loading places…</p>}
      {maps.error && (
        <p className="field__error" role="alert">
          Could not load the places: {errorText(maps.error)}
        </p>
      )}
      {maps.data && !places.length && (
        <p className="muted">
          This project has no places yet. Add them on the{' '}
          <Link to={`/p/${projectKey(props.projectPath)}/maps`}>Maps page</Link>.
        </p>
      )}
      {places.length > 0 && (
        <fieldset className="msel-places">
          <legend className="sr-only">Places</legend>
          {places.map((p) => {
            const checked = picked.includes(p.id)
            const id = `place-${p.id}`
            return (
              <div key={p.id} className="msel-places__item">
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && full}
                  onChange={() => toggle(p.id)}
                />
                <label htmlFor={id}>{p.label}</label>
              </div>
            )
          })}
          {full && <p className="muted">A row can name up to {MAX_ROW_PLACES} places.</p>}
        </fieldset>
      )}
    </Dialog>
  )
}
