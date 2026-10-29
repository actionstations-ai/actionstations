// Typed coordinates for a place (#436, NFR-3): the keyboard and screen reader way to pin a place,
// beside clicking the map. Site plans use percent of the image from the top left; maps use
// latitude and longitude.
import { useState } from 'react'
import type { PlacePosition } from '@shared/schemas'
import { isPercentPosition } from '@shared/maps/pins'
import { Button, Field } from '../../components/ui'

interface Props {
  position: PlacePosition | undefined
  mapId: string
  onChange: (pos: PlacePosition | null) => void
}

const num = (s: string): number | undefined =>
  s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : undefined

export function PositionFields({ position, mapId, onChange }: Props) {
  const percent = !position || isPercentPosition(position)
  const [a, setA] = useState(() =>
    String(position ? (isPercentPosition(position) ? position.x : position.lat) : ''),
  )
  const [b, setB] = useState(() =>
    String(position ? (isPercentPosition(position) ? position.y : position.lon) : ''),
  )
  const apply = () => {
    const x = num(a)
    const y = num(b)
    if (x === undefined || y === undefined) return
    onChange(percent ? { mapId, x, y } : { mapId, lat: x, lon: y })
  }
  return (
    <fieldset className="stack">
      <legend>Position on this map</legend>
      <div className="row">
        <Field
          label={percent ? 'Across (%)' : 'Latitude'}
          hint={percent ? '0 is the left edge' : undefined}
        >
          {(f) => (
            <input
              id={f.id}
              className="input"
              inputMode="decimal"
              value={a}
              onChange={(e) => setA(e.target.value)}
            />
          )}
        </Field>
        <Field
          label={percent ? 'Down (%)' : 'Longitude'}
          hint={percent ? '0 is the top edge' : undefined}
        >
          {(f) => (
            <input
              id={f.id}
              className="input"
              inputMode="decimal"
              value={b}
              onChange={(e) => setB(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="row">
        <Button size="sm" onClick={apply} disabled={num(a) === undefined || num(b) === undefined}>
          Set position
        </Button>
        {position && (
          <Button size="sm" onClick={() => onChange(null)}>
            Remove from this map
          </Button>
        )}
      </div>
    </fieldset>
  )
}
