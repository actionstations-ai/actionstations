// Map markers shared by both engines (#436). A marker is a button, so keyboard and screen
// reader users reach it; its state shows by shape and text as well as colour (NFR-3):
// delivered = filled, due = filled with a ring and "due", upcoming = dashed outline.
import { clsx } from 'clsx'
import type { MapMarker } from './marker-model'

export function MarkerButton(props: {
  marker: MapMarker
  name: string
  selected: boolean
  onActivate: (m: MapMarker) => void
  style?: React.CSSProperties
}) {
  const { marker: m } = props
  const text = m.rowIds.length > 1 ? String(m.rowIds.length) : (m.rowIds[0] ?? '')
  return (
    <button
      type="button"
      className={clsx(
        'map-pin',
        m.status && `map-pin--${m.status}`,
        `map-pin--${m.kind}`,
        m.rowIds.length > 1 && 'map-pin--cluster',
        props.selected && 'map-pin--selected',
      )}
      style={props.style}
      aria-label={props.name}
      aria-pressed={props.selected}
      onClick={(e) => {
        e.stopPropagation()
        props.onActivate(m)
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="map-pin__text" aria-hidden>
        {text}
        {m.status === 'due' && m.rowIds.length === 1 ? ' due' : ''}
      </span>
      <span className="map-pin__label" aria-hidden>
        {m.label}
      </span>
    </button>
  )
}

export function Legend() {
  return (
    <ul className="map-legend" aria-label="Legend">
      <li>
        <span className="map-legend__swatch map-legend__swatch--delivered" aria-hidden /> Delivered
      </li>
      <li>
        <span className="map-legend__swatch map-legend__swatch--due" aria-hidden /> Due
      </li>
      <li>
        <span className="map-legend__swatch map-legend__swatch--upcoming" aria-hidden /> Upcoming
      </li>
      <li>
        <span className="map-legend__swatch map-legend__swatch--command" aria-hidden /> Command post
      </li>
      <li>
        <span className="map-legend__swatch map-legend__swatch--cluster" aria-hidden /> Several rows
        at one place (number shown)
      </li>
    </ul>
  )
}
