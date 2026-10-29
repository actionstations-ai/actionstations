// The three map data dialogs in Settings › Maps (#436): a state map from the catalog, an area
// around a site from OpenFreeMap, and the user's own file. The state and area dialogs say which
// host they will contact before anything is requested.
import { useEffect, useState } from 'react'
import type { AreaPlanView, CatalogView } from '@shared/ipc'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const mb = (n: number): string =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(1)} GB`
    : `${Math.max(1, Math.round(n / 1024 ** 2))} MB`

export function StateDialog({ open, onOpenChange }: DialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Download a state map"
      description="State map files are published at github.com/actionstations-ai/maps. Opening the list contacts GitHub; nothing about your projects is sent."
      className="dialog--wide"
      footer={<Button onClick={() => onOpenChange(false)}>Close</Button>}
    >
      <StateBody onClose={() => onOpenChange(false)} />
    </Dialog>
  )
}

/** Mounted only while the dialog is open, so it starts empty each time. */
function StateBody({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<CatalogView>()
  const [error, setError] = useState('')
  const [asked, setAsked] = useState(false)
  const load = async () => {
    setAsked(true)
    try {
      setView(await call('maps:catalog', { refresh: true }))
    } catch (err) {
      setError(errorText(err))
    }
  }
  const download = async (id: string) => {
    try {
      await call('maps:download-state', { ids: [id] })
      toast.success('Download started', 'Follow it in the jobs tray. You can cancel it there.')
      onClose()
    } catch (err) {
      toast.error('Could not start the download', errorText(err))
    }
  }
  return (
    <>
      {!asked && <Button onClick={() => void load()}>Show the list</Button>}
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {view?.error && (
        <p className="muted">Could not refresh ({view.error}). Showing the saved list.</p>
      )}
      {view && view.entries.length === 0 && <p className="muted">The catalog has no maps yet.</p>}
      {view && view.entries.length > 0 && (
        <ul className="stack" aria-label="State maps">
          {view.entries.map((e) => (
            <li key={e.entry.id} className="row">
              <span>
                {e.entry.name} <span className="muted">{mb(e.bytes)}</span>
              </span>
              <Button
                size="sm"
                onClick={() => void download(e.entry.id)}
                disabled={e.installed && !e.updateAvailable}
              >
                {e.updateAvailable
                  ? `Update ${e.entry.name}`
                  : e.installed
                    ? 'Installed'
                    : `Download ${e.entry.name}`}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {view && (
        <p className="muted">
          Map data {view.attribution}. Release {view.release}.
        </p>
      )}
    </>
  )
}

const parseNum = (s: string): number => (s.trim() === '' ? Number.NaN : Number(s))

export function AreaDialog({ open, onOpenChange }: DialogProps) {
  const [box, setBox] = useState({ w: '', s: '', e: '', n: '' })
  const [zoom, setZoom] = useState({ min: '8', max: '12' })
  const [title, setTitle] = useState('')
  const [plan, setPlan] = useState<AreaPlanView>()
  const request = () => ({
    bbox: [parseNum(box.w), parseNum(box.s), parseNum(box.e), parseNum(box.n)] as [
      number,
      number,
      number,
      number,
    ],
    minZoom: parseNum(zoom.min),
    maxZoom: parseNum(zoom.max),
  })
  const valid = Object.values(box).every((v) => Number.isFinite(parseNum(v)))
  useEffect(() => {
    setPlan(undefined)
    if (!open || !valid) return
    const req = request()
    if (!Number.isInteger(req.minZoom) || !Number.isInteger(req.maxZoom)) return
    let live = true
    call('maps:area-plan', req)
      .then((p) => live && setPlan(p))
      .catch(() => undefined)
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, box, zoom])
  const start = async () => {
    try {
      await call('maps:area-download', { ...request(), title: title.trim() || 'Map area' })
      toast.success('Download started', 'Follow it in the jobs tray. You can cancel it there.')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not start the download', errorText(err))
    }
  }
  const input = (label: string, key: keyof typeof box) => (
    <Field label={label}>
      {(f) => (
        <input
          id={f.id}
          className="input"
          inputMode="decimal"
          value={box[key]}
          onChange={(e) => setBox({ ...box, [key]: e.target.value })}
        />
      )}
    </Field>
  )
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Download an area"
      description="Downloads a small area from OpenFreeMap (tiles.openfreemap.org) for offline use. Its offline terms allow up to 3,000 tiles and 50 MB, with 4 requests at a time."
      className="dialog--wide"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void start()} disabled={!plan?.allowed}>
            Download
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
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <fieldset className="stack">
          <legend>Box in degrees</legend>
          <div className="row">
            {input('West', 'w')}
            {input('South', 's')}
            {input('East', 'e')}
            {input('North', 'n')}
          </div>
        </fieldset>
        <div className="row">
          <Field label="Lowest zoom">
            {(f) => (
              <input
                id={f.id}
                className="input"
                inputMode="numeric"
                value={zoom.min}
                onChange={(e) => setZoom({ ...zoom, min: e.target.value })}
              />
            )}
          </Field>
          <Field label="Highest zoom (14 at most)">
            {(f) => (
              <input
                id={f.id}
                className="input"
                inputMode="numeric"
                value={zoom.max}
                onChange={(e) => setZoom({ ...zoom, max: e.target.value })}
              />
            )}
          </Field>
        </div>
        <p role="status" aria-live="polite">
          {plan?.allowed &&
            `${plan.tiles.toLocaleString('en-US')} tiles, about ${mb(plan.estimatedBytes)}, within OpenFreeMap's 3,000-tile / 50 MB offline limit.`}
          {plan && !plan.allowed && (
            <>
              {plan.reason}
              {plan.suggestedMaxZoom !== undefined &&
                ` Try a highest zoom of ${plan.suggestedMaxZoom}, or download the state map instead.`}
            </>
          )}
        </p>
      </div>
    </Dialog>
  )
}

export function ImportDialog({ open, onOpenChange }: DialogProps) {
  const [file, setFile] = useState('')
  const [title, setTitle] = useState('')
  const [attribution, setAttribution] = useState('')
  const pick = async () => {
    const [picked] = await call('dialog:open-files', {
      title: 'Choose a map file',
      filters: [{ name: 'Map files', extensions: ['pmtiles', 'mbtiles'] }],
      multi: false,
    })
    if (!picked) return
    setFile(picked)
    if (!title) setTitle((picked.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, ''))
  }
  const run = async () => {
    try {
      await call('maps:import-archive', {
        filePath: file,
        title: title.trim(),
        ...(attribution.trim() ? { attribution: attribution.trim() } : {}),
      })
      toast.success('Map file imported')
      onOpenChange(false)
      setFile('')
    } catch (err) {
      toast.error('Could not import the file', errorText(err))
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import a map file"
      description="A .pmtiles or .mbtiles file up to 4 GB. It is copied into the app's map store."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => void run()} disabled={!file || !title.trim()}>
            Import
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="row">
          <Button onClick={() => void pick()}>Choose file…</Button>
          <span className="muted">{file || 'No file chosen'}</span>
        </div>
        <Field label="Name">
          {(f) => (
            <input
              id={f.id}
              className="input"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Attribution"
          hint="Needed only when the file does not carry one. It is shown on every map made from it."
        >
          {(f) => (
            <input
              id={f.id}
              className="input"
              value={attribution}
              maxLength={500}
              onChange={(e) => setAttribution(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  )
}
