import type { MapStatePayload } from '../../../shared/live/schemas'
import { formatLatLon, schematicPoints, SCHEMATIC_ASPECT } from '../../../shared/maps/schematic'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { EmptyState } from '../../components/EmptyState'
import { useBlobUrl } from '../injects/media'
import './map.css'

const T = STRINGS.map

type Pin = MapStatePayload['pins'][number]

interface Placed {
  pin: Pin
  n: number
  x: number
  y: number
}

/** Pins with their number and position in percent of the frame; pins with no position are listed only. */
export function placePins(map: MapStatePayload): Placed[] {
  const geo = map.pins.filter((p) => p.lat !== undefined && p.lon !== undefined)
  const spots = schematicPoints(geo.map((p) => ({ lat: p.lat!, lon: p.lon! })))
  return map.pins.map((pin, i) => {
    const g = geo.indexOf(pin)
    const spot = g >= 0 ? spots[g] : undefined
    return {
      pin,
      n: i + 1,
      x: spot?.x ?? pin.x ?? 50,
      y: spot?.y ?? pin.y ?? 50,
    }
  })
}

function Frame({
  session,
  map,
  placed,
}: {
  session: PlayerSession
  map: MapStatePayload
  placed: Placed[]
}) {
  const image = useBlobUrl(session.media, map.image, map.mapKind === 'site_plan')
  const plan = map.mapKind === 'site_plan' && map.image
  return (
    <div
      className="pmap__frame"
      data-kind={map.mapKind}
      style={plan ? undefined : { aspectRatio: String(SCHEMATIC_ASPECT) }}
      role="img"
      aria-label={map.alt ?? map.title}
    >
      {plan && image.status === 'ready' ? (
        <img className="pmap__img" src={image.url} alt="" />
      ) : null}
      {plan && image.status === 'loading' ? <p className="pmap__note">{T.loading}</p> : null}
      {plan && image.status === 'error' ? <p className="pmap__note">{T.imageError}</p> : null}
      {placed.map(({ pin, n, x, y }) => (
        <span
          key={n}
          className={`pmap__pin pmap__pin--${pin.kind}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          aria-hidden="true"
        >
          {n}
        </span>
      ))}
    </div>
  )
}

function PlaceList({ placed }: { placed: Placed[] }) {
  return (
    <section aria-labelledby="pmap-places">
      <h2 id="pmap-places">{T.placesHeading}</h2>
      {placed.length === 0 ? (
        <p className="muted">{T.noPlaces}</p>
      ) : (
        <ol className="pmap__list">
          {placed.map(({ pin, n }) => (
            <li key={n}>
              <strong>{pin.label}</strong>
              {pin.lat !== undefined && pin.lon !== undefined ? (
                <span className="muted"> {formatLatLon({ lat: pin.lat, lon: pin.lon })}</span>
              ) : null}
              {pin.detail ? <span className="muted"> {T.rows(pin.detail)}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * The map the controller shares (spec 0436 FR-8): a site plan with numbered places, or for a
 * geographic map a schematic of the places. Only the places this device may see arrive. The
 * numbered list under the picture is the accessible form of the same information.
 */
export function MapScreen({ session, onBack }: { session: PlayerSession; onBack: () => void }) {
  const map = useStore(session.store, (s) => s.map)
  return (
    <section className="screen" aria-labelledby="pmap-heading" data-screen="map">
      <button type="button" className="btn btn--quiet back" onClick={onBack}>
        <span aria-hidden="true">‹ </span>
        {T.back}
      </button>
      <div className="screen__head">
        <h1 id="pmap-heading">{map?.title ?? T.heading}</h1>
      </div>
      {map ? (
        <>
          <Frame session={session} map={map} placed={placePins(map)} />
          {map.mapKind === 'geo' ? <p className="muted">{T.geoNote}</p> : null}
          <PlaceList placed={placePins(map)} />
        </>
      ) : (
        <EmptyState title={T.none} hint={T.noneHint} />
      )}
    </section>
  )
}
