// The map on the projector (#500, spec 0436 FR-8): only the pins of delivered rows, with labels
// and a legend. It follows the map chosen on Facilitate's Map tab and refreshes as rows are
// delivered. Upcoming and due rows never show here, so the room sees no spoilers.
import { useEffect } from 'react'
import { useParams } from 'react-router'
import { pinsFor } from '@shared/maps/pins'
import { MapView } from '../../components/map/MapView'
import { markerFromPin } from '../../components/map/marker-model'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { useProjectMaps } from '../../state/maps'
import { fromProjectKey } from '../../state/project'
import './present.css'
import './present-map.css'

const REFRESH_MS = 2_000

export default function PresentMap() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const maps = useProjectMaps(projectPath)
  const scenario = useIpcQuery('scenarios:get', { projectPath, scenarioId })
  const state = useIpcQuery(
    'facilitator:state-get',
    { projectPath, scenarioId },
    { refetchInterval: REFRESH_MS },
  )

  useEffect(() => {
    document.title = 'Presentation'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void call('facilitator:close-present')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const layers = maps.data?.maps.maps ?? []
  const wanted = state.data?.map?.mapId ?? params.mapId
  const layer = layers.find((m) => m.id === wanted) ?? layers.find((m) => m.id === params.mapId)
  if (!layer || !scenario.data || !state.data || !maps.data)
    return (
      <div className="present" data-testid="present-map">
        <p className="present__empty">
          {maps.isError || scenario.isError
            ? 'The map is no longer available.'
            : 'Loading the map…'}
        </p>
      </div>
    )
  const pins = pinsFor({
    rows: scenario.data.msel.map((r) => ({ id: r.id, time: r.time, placeIds: r.placeIds })),
    delivered: state.data.delivered,
    elapsedMin: -1,
    places: maps.data.maps.places,
    mapId: layer.id,
    audience: 'room',
  })
  return (
    <div className="present present-map" data-testid="present-map">
      <h1 className="sr-only">{layer.title}</h1>
      <div className="present-map__frame">
        <MapView
          projectPath={projectPath}
          layer={layer}
          markers={pins.map(markerFromPin)}
          rowStatus={Object.fromEntries(
            pins.flatMap((p) => p.rows.map((r) => [r.rowId, r.status])),
          )}
          showLegend
        />
      </div>
    </div>
  )
}
