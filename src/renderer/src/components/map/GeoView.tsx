// Geographic map engine (#436, FR-9 to FR-12): MapLibre GL JS drawing an installed archive or
// the online provider through the asmap:// protocol. Attribution is always visible (FR-18).
// MapLibre loads on first use, so a project with only site plans never pays for it. Markers are
// buttons laid over the map and moved on every frame the map moves.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { Plus, Minus } from 'lucide-react'
import type { BasemapView } from '@shared/ipc'
import type { MapLayer } from '@shared/schemas'
import { isPercentPosition } from '@shared/maps/pins'
import { Button } from '../ui'
import { useIpcQuery } from '../../lib/query'
import { markerName, type MapMarker } from './marker-model'
import { MarkerButton } from './markers'
import type { MapEngineProps } from './SitePlanView'
import { planFor, reducedMotion, webglAvailable } from './geo/plan'
import { registerAsmap } from './geo/protocol'
import 'maplibre-gl/dist/maplibre-gl.css'

type Geo = Extract<MapLayer, { kind: 'geo' }>
const DEFAULT_VIEW = { center: [-98, 39] as [number, number], zoom: 3 }

function Unavailable({ view }: { view: Exclude<BasemapView, { mode: 'archive' | 'online' }> }) {
  return (
    <div className="map-unavailable" role="status">
      <p>{view.message}</p>
      <p>
        <Link to="/settings">Open map settings</Link>
      </p>
    </div>
  )
}

export function GeoView(props: MapEngineProps & { layer: Geo }) {
  const { layer, projectPath } = props
  const basemap = useIpcQuery('maps:basemap', { projectPath, mapId: layer.id })
  if (basemap.isPending) return <p className="muted">Loading the map…</p>
  if (basemap.isError) return <p className="field__error">{basemap.error.message}</p>
  const view = basemap.data
  if (view.mode === 'offline-off' || view.mode === 'missing') return <Unavailable view={view} />
  if (!webglAvailable())
    return (
      <p className="map-unavailable" role="status">
        This computer cannot draw vector maps. Use a raster map file or a site plan.
      </p>
    )
  return <GeoCanvas {...props} basemap={view} />
}

function GeoCanvas(props: MapEngineProps & { layer: Geo; basemap: BasemapView }) {
  const { layer, projectPath, markers, basemap } = props
  const box = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const pick = useRef(props.onPick)
  useEffect(() => {
    pick.current = props.onPick
  })
  const [, setFrame] = useState(0)
  const plan = planFor(basemap, projectPath, layer)
  const styleKey = JSON.stringify(plan?.style ?? null)

  useEffect(() => {
    let cancelled = false
    let map: MapLibreMap | null = null
    void (async () => {
      const [mod, worker] = await Promise.all([
        import('maplibre-gl/dist/maplibre-gl-csp.js'),
        import('maplibre-gl/dist/maplibre-gl-csp-worker.js?url'),
      ])
      const maplibregl = ((mod as { default?: unknown }).default ?? mod) as typeof mod
      if (cancelled || !box.current || !plan) return
      maplibregl.setWorkerUrl(worker.default)
      registerAsmap(maplibregl.addProtocol as never)
      map = new maplibregl.Map({
        container: box.current,
        style: plan.style,
        center: layer.view ? [layer.view.center.lon, layer.view.center.lat] : DEFAULT_VIEW.center,
        zoom: layer.view?.zoom ?? DEFAULT_VIEW.zoom,
        attributionControl: false,
        renderWorldCopies: false,
        fadeDuration: reducedMotion() ? 0 : 150,
        // No prefetching or background refresh (the OSM tile policy, FR-11).
        refreshExpiredTiles: false,
        maxTileCacheSize: 32,
      })
      setMap(map)
      if (!layer.view && plan.bounds)
        map.fitBounds(plan.bounds, { padding: 24, animate: false, maxZoom: 14 })
      map.on('render', () => setFrame((n) => n + 1))
      map.on('click', (e) => pick.current?.({ lat: e.lngLat.lat, lon: e.lngLat.lng }))
      // A missing tile is normal at the edge of a map file; keep the console quiet.
      map.on('error', () => undefined)
    })()
    return () => {
      cancelled = true
      map?.remove()
      setMap(null)
    }
    // The style changes only with the basemap; markers move without rebuilding the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleKey, layer.id])

  const zoom = (d: number) =>
    map?.easeTo({ zoom: map.getZoom() + d, duration: reducedMotion() ? 0 : 200 })
  return (
    <div className="map-engine">
      <div className="map-toolbar" role="group" aria-label="Map controls">
        <Button size="sm" onClick={() => zoom(1)} aria-label="Zoom in">
          <Plus size={14} aria-hidden />
        </Button>
        <Button size="sm" onClick={() => zoom(-1)} aria-label="Zoom out">
          <Minus size={14} aria-hidden />
        </Button>
      </div>
      <div className="map-frame map-frame--geo" role="group" aria-label={`Map: ${layer.title}`}>
        <div ref={box} className="map-geo" data-testid="geo-map" />
        <div className="map-overlay">
          {markers.map((m) => (
            <GeoMarker key={m.id} m={m} map={map} {...props} />
          ))}
        </div>
        <p className="map-attribution" data-testid="map-attribution">
          {plan?.attributionUrl ? (
            <a href={plan.attributionUrl} target="_blank" rel="noreferrer noopener">
              {plan.attribution}
            </a>
          ) : (
            plan?.attribution
          )}
        </p>
      </div>
    </div>
  )
}

function GeoMarker(props: MapEngineProps & { m: MapMarker; map: MapLibreMap | null }) {
  const { m, map } = props
  if (!map || isPercentPosition(m.position)) return null
  const p = map.project([m.position.lon, m.position.lat])
  return (
    <MarkerButton
      marker={m}
      name={markerName(m, props.rowStatus)}
      selected={
        m.id === props.selectedMarkerId ||
        (!!props.selectedRowId && m.rowIds.includes(props.selectedRowId))
      }
      onActivate={props.onActivate}
      style={{ left: `${p.x}px`, top: `${p.y}px` }}
    />
  )
}
