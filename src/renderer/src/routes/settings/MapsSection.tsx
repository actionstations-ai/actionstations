// Settings › Maps (#436, FR-10, NFR-6): the online maps switch with what the provider can see,
// the provider choice, and the map data stored on this computer. Nothing goes out while the
// switch is off; downloads start only from the buttons here.
import { useState } from 'react'
import type { AppSettings, MapsSettings } from '@shared/schemas'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'
import { useMapsEvents } from '../../state/maps'
import { AreaDialog, ImportDialog, StateDialog } from './MapsDialogs'

export const ONLINE_MAPS_NOTICE =
  "When on, the map provider receives your computer's IP address and the map tiles for the area you view. Nothing else from your project is sent."

type Patch = Parameters<typeof call<'maps:settings-set'>>[1]

async function setMaps(patch: Patch): Promise<void> {
  try {
    await call('maps:settings-set', patch)
    await queryClient.invalidateQueries({ queryKey: ['settings:get'] })
  } catch (err) {
    toast.error('Could not save map settings', errorText(err))
  }
}

function ProviderChoice({ online }: { online: MapsSettings['online'] }) {
  const radio = (value: MapsSettings['online']['provider'], label: string) => (
    <label className="row">
      <input
        type="radio"
        name="map-provider"
        checked={online.provider === value}
        onChange={() => void setMaps({ online: { provider: value } })}
      />
      {label}
    </label>
  )
  return (
    <fieldset className="stack">
      <legend>Provider</legend>
      {radio('openfreemap', 'OpenFreeMap (no key, vector maps)')}
      {online.provider === 'openfreemap' && (
        <Field label="Style">
          {(f) => (
            <select
              id={f.id}
              className="input settings-select"
              value={online.style}
              onChange={(e) =>
                void setMaps({
                  online: { style: e.target.value as MapsSettings['online']['style'] },
                })
              }
            >
              {['liberty', 'positron', 'bright', 'dark'].map((s) => (
                <option key={s} value={s}>
                  {s[0]!.toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      {radio('osm', 'OpenStreetMap standard (for viewing only, under the OSM tile usage policy)')}
      {online.provider === 'osm' && (
        <Field
          label="Tile address"
          hint="Must start with https://. Tiles are cached, never prefetched or saved for offline use."
        >
          {(f) => (
            <input
              id={f.id}
              className="input"
              defaultValue={online.osmUrl ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'}
              onBlur={(e) => void setMaps({ online: { osmUrl: e.target.value.trim() } })}
            />
          )}
        </Field>
      )}
      {radio('custom', 'Custom address')}
      {online.provider === 'custom' && (
        <>
          <Field
            label="Style or tile address"
            hint="A MapLibre style, or a tile address with {z}/{x}/{y}."
          >
            {(f) => (
              <input
                id={f.id}
                className="input"
                defaultValue={online.customUrl ?? ''}
                onBlur={(e) => void setMaps({ online: { customUrl: e.target.value.trim() } })}
              />
            )}
          </Field>
          <Field label="Attribution" hint="Required. It is shown on every map and in exports.">
            {(f) => (
              <input
                id={f.id}
                className="input"
                defaultValue={online.customAttribution ?? ''}
                onBlur={(e) =>
                  void setMaps({ online: { customAttribution: e.target.value.trim() } })
                }
              />
            )}
          </Field>
        </>
      )}
    </fieldset>
  )
}

function OnlinePart({ maps }: { maps: MapsSettings }) {
  return (
    <div className="stack">
      <label className="row">
        <input
          type="checkbox"
          checked={maps.online.enabled}
          aria-describedby="online-maps-notice"
          onChange={(e) => void setMaps({ online: { enabled: e.target.checked } })}
        />
        Use online maps
      </label>
      <p id="online-maps-notice" className="muted">
        {ONLINE_MAPS_NOTICE}
      </p>
      {maps.online.enabled && <ProviderChoice online={maps.online} />}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  return `${Math.max(1, Math.round(n / 1024 ** 2))} MB`
}

function StoredList() {
  const store = useIpcQuery('maps:store', undefined)
  const [confirm, setConfirm] = useState<string>()
  const remove = async (sha256: string) => {
    try {
      await call('maps:store-delete', { sha256 })
      setConfirm(undefined)
    } catch (err) {
      toast.error('Could not delete the map file', errorText(err))
    }
  }
  if (!store.data) return <p className="muted">Loading…</p>
  if (store.data.length === 0)
    return (
      <p className="muted">No map files on this computer. Online maps are the only map data.</p>
    )
  return (
    <ul className="stack" aria-label="Map files on this computer">
      {store.data.map((a) => (
        <li key={a.sha256} className="row">
          <span>
            <strong>{a.title}</strong>{' '}
            <span className="muted">
              {formatBytes(a.bytes)},{' '}
              {a.kind === 'catalog'
                ? `release ${a.builtAt ?? ''}`
                : a.kind === 'area'
                  ? `OpenFreeMap ${a.builtAt ?? ''}`
                  : 'imported'}
              ,{' '}
              {a.usedBy.length === 0
                ? 'not used by a project'
                : `used by ${a.usedBy.length} ${a.usedBy.length === 1 ? 'project' : 'projects'}`}
            </span>
          </span>
          {confirm === a.sha256 ? (
            <>
              <Button size="sm" variant="danger" onClick={() => void remove(a.sha256)}>
                Delete {a.title}
              </Button>
              <Button size="sm" onClick={() => setConfirm(undefined)}>
                Keep
              </Button>
            </>
          ) : (
            <Button size="sm" aria-label={`Delete ${a.title}`} onClick={() => setConfirm(a.sha256)}>
              Delete
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

function DataPart() {
  const [dialog, setDialog] = useState<'state' | 'area' | 'import'>()
  const [status, setStatus] = useState('')
  const checkUpdates = async () => {
    try {
      const { updates } = await call('maps:check-updates')
      setStatus(
        updates.length === 0
          ? 'Your state maps are up to date.'
          : `Updates available for: ${updates.map((u) => u.id).join(', ')}. Open Download a state map to get them.`,
      )
    } catch (err) {
      setStatus(`Could not check: ${errorText(err)}`)
    }
  }
  return (
    <div className="stack">
      <StoredList />
      <div className="row">
        <Button onClick={() => setDialog('state')}>Download a state map…</Button>
        <Button onClick={() => setDialog('area')}>Download an area…</Button>
        <Button onClick={() => setDialog('import')}>Import file…</Button>
        <Button onClick={() => void checkUpdates()}>Check for updates</Button>
      </div>
      <p role="status" className="muted">
        {status}
      </p>
      <StateDialog open={dialog === 'state'} onOpenChange={(o) => !o && setDialog(undefined)} />
      <AreaDialog open={dialog === 'area'} onOpenChange={(o) => !o && setDialog(undefined)} />
      <ImportDialog open={dialog === 'import'} onOpenChange={(o) => !o && setDialog(undefined)} />
    </div>
  )
}

export function MapsSection({ settings }: { settings: AppSettings }) {
  useMapsEvents()
  return (
    <section className="card stack settings-section" aria-labelledby="maps-heading">
      <div>
        <h2 id="maps-heading">Maps</h2>
        <p className="muted">
          Maps show where injects happen. Offline map data works without internet. Every download is
          started by you, checked against its published checksum, and shown with its attribution.
        </p>
      </div>
      <OnlinePart maps={settings.maps} />
      <h3>Offline map data</h3>
      <DataPart />
    </section>
  )
}
