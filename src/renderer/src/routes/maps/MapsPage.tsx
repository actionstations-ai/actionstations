// Maps (#436, FR-1 to FR-4): the project's site plans and geographic maps, and the named places
// pinned on them. A place can be placed by clicking the map or by typing its coordinates, so
// the editor works without a pointer. Places are shared by every scenario in the project.
import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import type { MapLayer, Place, PlacePosition, ProjectMaps } from '@shared/schemas'
import { PLACE_KINDS } from '@shared/schemas'
import { Button, EmptyState, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { MapView } from '../../components/map/MapView'
import { markerFromPlace, type MapMarker } from '../../components/map/marker-model'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { newMapId, useProjectMaps } from '../../state/maps'
import { fromProjectKey } from '../../state/project'
import { AddGeoMapDialog } from './AddGeoMapDialog'
import { FactsPanel } from './FactsPanel'
import { PositionFields } from './PositionFields'
import './maps-page.css'

type Save = ReturnType<typeof useProjectMaps>['save']

function baseName(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? 'Site plan'
  return file.replace(/\.[^.]+$/, '')
}

async function addSitePlan(
  projectPath: string,
  pdfPage: number,
  onAdded: (mapId: string) => void,
): Promise<void> {
  const [file] = await call('dialog:open-files', {
    title: 'Choose a site plan image or PDF',
    filters: [{ name: 'Images and PDF', extensions: ['png', 'jpg', 'jpeg', 'webp', 'pdf'] }],
    multi: false,
  })
  if (!file) return
  try {
    const added = await call('maps:import-plan', {
      projectPath,
      filePath: file,
      title: baseName(file),
      ...(/\.pdf$/i.test(file) ? { page: pdfPage } : {}),
    })
    toast.success('Site plan added', 'Pick a place, then click the plan to pin it.')
    onAdded(added.mapId)
  } catch (err) {
    toast.error('Could not add the site plan', errorText(err))
  }
}

const withPosition = (place: Place, mapId: string, pos: PlacePosition | null): Place => ({
  ...place,
  positions: [...place.positions.filter((p) => p.mapId !== mapId), ...(pos ? [pos] : [])],
})

function PlaceForm(props: { place: Place; mapId: string; save: Save; onDelete: () => void }) {
  const { place, mapId } = props
  const update = (patch: Partial<Place>) =>
    void props
      .save((m) => {
        m.places = m.places.map((p) => (p.id === place.id ? { ...p, ...patch } : p))
      })
      .catch((e) => toast.error('Could not save', errorText(e)))
  const here = place.positions.find((p) => p.mapId === mapId)
  return (
    <div className="stack" role="group" aria-label={`Place: ${place.label}`}>
      <Field label="Name">
        {(f) => (
          <input
            id={f.id}
            className="input"
            maxLength={80}
            defaultValue={place.label}
            onBlur={(e) => e.target.value.trim() && update({ label: e.target.value.trim() })}
          />
        )}
      </Field>
      <Field label="Kind">
        {(f) => (
          <select
            id={f.id}
            className="input"
            value={place.kind}
            onChange={(e) => update({ kind: e.target.value as Place['kind'] })}
          >
            {PLACE_KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Facility fact (optional)" hint="Like gates:A1, from the facility facts.">
        {(f) => (
          <input
            id={f.id}
            className="input"
            maxLength={200}
            defaultValue={place.factRef ?? ''}
            onBlur={(e) => {
              const factRef = e.target.value.trim()
              update(factRef ? { factRef } : { factRef: undefined as unknown as string })
            }}
          />
        )}
      </Field>
      <PositionFields
        position={here}
        mapId={mapId}
        onChange={(pos) => update(withPosition(place, mapId, pos))}
      />
      <Button variant="danger" size="sm" onClick={props.onDelete}>
        Delete place
      </Button>
    </div>
  )
}

function PlacesPanel(props: {
  maps: ProjectMaps
  layer: MapLayer
  selectedId: string | undefined
  onSelect: (id: string | undefined) => void
  save: Save
  projectPath: string
}) {
  const { maps, layer } = props
  const [name, setName] = useState('')
  const selected = maps.places.find((p) => p.id === props.selectedId)
  const add = async (label: string, factRef?: string) => {
    const id = newMapId('place')
    try {
      await props.save((m) => {
        m.places.push({
          id,
          label,
          kind: 'other',
          positions: [],
          note: '',
          ...(factRef ? { factRef } : {}),
        })
      })
      props.onSelect(id)
      setName('')
    } catch (e) {
      toast.error('Could not add the place', errorText(e))
    }
  }
  const remove = (id: string) =>
    void props
      .save((m) => {
        m.places = m.places.filter((p) => p.id !== id)
      })
      .then(() => props.onSelect(undefined))
      .catch((e) => toast.error('Could not delete', errorText(e)))
  return (
    <section className="card stack" aria-labelledby="places-heading">
      <h2 id="places-heading">Places</h2>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) void add(name.trim())
        }}
      >
        <Field label="New place">
          {(f) => (
            <input
              id={f.id}
              className="input"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={!name.trim()}>
          Add place
        </Button>
      </form>
      {maps.places.length === 0 ? (
        <p className="muted">No places yet. Add one, then pin it on the map.</p>
      ) : (
        <ul className="stack" aria-label="Places in this project">
          {maps.places.map((p) => {
            const here = p.positions.some((pos) => pos.mapId === layer.id)
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className="map-locations__select"
                  aria-pressed={p.id === props.selectedId}
                  onClick={() => props.onSelect(p.id === props.selectedId ? undefined : p.id)}
                >
                  {p.label}
                </button>{' '}
                <span className="muted">
                  {p.kind}, {here ? 'pinned here' : 'not pinned on this map'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {selected && (
        <PlaceForm
          key={selected.id}
          place={selected}
          mapId={layer.id}
          save={props.save}
          onDelete={() => remove(selected.id)}
        />
      )}
      <FactsPanel
        projectPath={props.projectPath}
        places={maps.places}
        onAdd={(label, ref) => void add(label, ref)}
      />
    </section>
  )
}

function MapEditor(props: { projectPath: string; maps: ProjectMaps; save: Save; layer: MapLayer }) {
  const { maps, layer } = props
  const [selectedId, setSelectedId] = useState<string>()
  const markers = useMemo(
    () => maps.places.flatMap((p) => markerFromPlace(p, layer.id) ?? []),
    [maps.places, layer.id],
  )
  const pick = (p: { x: number; y: number } | { lat: number; lon: number }) => {
    if (!selectedId)
      return toast.info('Pick a place first', 'Choose it in the Places list, then click the map.')
    const place = maps.places.find((x) => x.id === selectedId)
    if (!place) return
    const pos = { mapId: layer.id, ...p } as PlacePosition
    void props
      .save((m) => {
        m.places = m.places.map((x) => (x.id === place.id ? withPosition(x, layer.id, pos) : x))
      })
      .catch((e) => toast.error('Could not save', errorText(e)))
  }
  return (
    <div className="maps-page__grid">
      <MapView
        projectPath={props.projectPath}
        layer={layer}
        markers={markers as MapMarker[]}
        selectedMarkerId={selectedId}
        onSelectMarker={setSelectedId}
        onPick={pick}
      />
      <PlacesPanel
        maps={maps}
        layer={layer}
        selectedId={selectedId}
        onSelect={setSelectedId}
        save={props.save}
        projectPath={props.projectPath}
      />
    </div>
  )
}

export default function MapsPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const { data, error, isPending, save } = useProjectMaps(projectPath)
  const [mapId, setMapId] = useState<string>()
  const [pdfPage, setPdfPage] = useState(1)
  const [geoOpen, setGeoOpen] = useState(false)
  const store = useIpcQuery('maps:store', undefined)
  if (isPending) return <div className="page muted">Loading…</div>
  if (error || !data)
    return (
      <div className="page">
        <p className="field__error" role="alert">
          Could not load maps: {error?.message}
        </p>
      </div>
    )
  const layers = data.maps.maps
  const layer = layers.find((m) => m.id === (mapId ?? data.maps.defaultMapId)) ?? layers[0]
  return (
    <div className="page page--wide">
      <PageHeader
        eyebrow="Plan"
        title="Maps"
        description="Pin places on a site plan or a map, then give each MSEL row a place. Facilitate shows delivered and due rows where they happen."
        actions={
          <>
            <label className="maps-pdf-page">
              PDF page
              <input
                type="number"
                className="input"
                min={1}
                value={pdfPage}
                onChange={(e) => setPdfPage(Math.max(1, Math.floor(Number(e.target.value)) || 1))}
              />
            </label>
            <Button onClick={() => void addSitePlan(projectPath, pdfPage, setMapId)}>
              Add site plan
            </Button>
            <Button onClick={() => setGeoOpen(true)}>Add map</Button>
          </>
        }
      />
      {!layer ? (
        <EmptyState
          title="No maps yet"
          body="Add a picture of the site, such as a terminal plan or a campus map, or a street map."
        />
      ) : (
        <>
          <Field label="Map">
            {(f) => (
              <select
                id={f.id}
                className="input settings-select"
                value={layer.id}
                onChange={(e) => setMapId(e.target.value)}
              >
                {layers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({m.kind === 'site_plan' ? 'site plan' : 'map'})
                  </option>
                ))}
              </select>
            )}
          </Field>
          <MapEditor
            key={layer.id}
            projectPath={projectPath}
            maps={data.maps}
            save={save}
            layer={layer}
          />
        </>
      )}
      <AddGeoMapDialog
        open={geoOpen}
        onOpenChange={setGeoOpen}
        archives={store.data ?? []}
        onCreate={async (layer) => {
          await save((m) => {
            m.maps.push(layer)
            m.defaultMapId ??= layer.id
          })
          setMapId(layer.id)
        }}
      />
    </div>
  )
}
