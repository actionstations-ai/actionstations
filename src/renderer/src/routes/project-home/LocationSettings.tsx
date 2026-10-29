// Project settings → Location (#439): where the organization is, for optional hazard data.
// A county comes from a list built into the app (no geocoding service is called); coordinates can
// also be typed. The full values stay in the project; only the rounded values are ever sent.
import { useState, type FormEvent } from 'react'
import type { CountyMatch } from '@shared/ipc/hazards'
import type { Project } from '@shared/schemas'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { draftToLocation, toDraft, type Draft } from './location-draft'

function CountySearch(props: { onPick: (c: CountyMatch) => void }) {
  const [query, setQuery] = useState('')
  const found = useIpcQuery(
    'hazards:gazetteer-search',
    { query },
    { enabled: query.trim().length >= 2 },
  )
  return (
    <div className="stack">
      <Field
        label="Find a US county"
        hint="Type a county and state, such as Cook, IL. The list is built into the app; nothing is sent."
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            className="input"
            type="search"
            value={query}
            {...(describedBy ? { 'aria-describedby': describedBy } : {})}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
      </Field>
      {query.trim().length >= 2 && found.data && (
        <ul className="location-matches" aria-label="Matching counties">
          {found.data.length === 0 && <li className="muted">No county matches.</li>}
          {found.data.map((c) => (
            <li key={`${c.stateFips}${c.countyFips}`}>
              <Button
                size="sm"
                onClick={() => {
                  props.onPick(c)
                  setQuery('')
                }}
              >
                Use {c.label}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function LocationSettings({ path, project }: { path: string; project: Project }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(project.location))
  const [error, setError] = useState<string>()
  const save = useIpcMutation('project:update', { invalidates: ['project:get', 'hazards:plan'] })
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))
  const pick = (c: CountyMatch) =>
    setDraft((d) => ({
      ...d,
      label: c.label,
      lat: String(c.lat),
      lon: String(c.lon),
      stateFips: c.stateFips,
      countyFips: c.countyFips,
    }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const r = draftToLocation(draft)
    if ('error' in r) return setError(r.error)
    setError(undefined)
    save.mutate(
      { path, patch: { location: r.value } },
      {
        onSuccess: () => toast.success('Location saved'),
        onError: (err) => toast.error('Could not save the location', err),
      },
    )
  }
  const clear = () =>
    save.mutate(
      { path, patch: { location: null } },
      {
        onSuccess: () => {
          setDraft(toDraft(undefined))
          toast.success('Location removed')
        },
        onError: (err) => toast.error('Could not remove the location', err),
      },
    )
  return (
    <section className="card stack" aria-labelledby="location-title">
      <div>
        <h2 id="location-title">Location</h2>
        <p className="muted">
          Used only if you turn on hazard data in Settings. Your exact location stays in this
          project; a fetch sends it rounded.
        </p>
      </div>
      <CountySearch onPick={pick} />
      <form className="stack" onSubmit={submit} aria-label="Project location">
        <div className="form-grid">
          <Field label="Place name">
            {({ id }) => (
              <input
                id={id}
                className="input"
                value={draft.label}
                onChange={(e) => set('label', e.target.value)}
              />
            )}
          </Field>
          <Field label="Latitude">
            {({ id }) => (
              <input
                id={id}
                className="input"
                inputMode="decimal"
                value={draft.lat}
                onChange={(e) => set('lat', e.target.value)}
              />
            )}
          </Field>
          <Field label="Longitude">
            {({ id }) => (
              <input
                id={id}
                className="input"
                inputMode="decimal"
                value={draft.lon}
                onChange={(e) => set('lon', e.target.value)}
              />
            )}
          </Field>
          <Field label="State code (FIPS)" hint="Two digits, US only.">
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input"
                inputMode="numeric"
                value={draft.stateFips}
                {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                onChange={(e) => set('stateFips', e.target.value)}
              />
            )}
          </Field>
          <Field label="County code (FIPS)" hint="Three digits, US only.">
            {({ id, describedBy }) => (
              <input
                id={id}
                className="input"
                inputMode="numeric"
                value={draft.countyFips}
                {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                onChange={(e) => set('countyFips', e.target.value)}
              />
            )}
          </Field>
        </div>
        <fieldset className="form-section">
          <legend>How precisely a fetch sends the location</legend>
          <label className="row">
            <input
              type="radio"
              name="precision"
              checked={draft.precision === '0.01'}
              onChange={() => set('precision', '0.01')}
            />
            <span>About 1 km (0.01 degrees). Needed for a useful weather point.</span>
          </label>
          <label className="row">
            <input
              type="radio"
              name="precision"
              checked={draft.precision === '0.1'}
              onChange={() => set('precision', '0.1')}
            />
            <span>About 11 km (0.1 degrees). Less exact.</span>
          </label>
        </fieldset>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <Button type="submit" variant="primary" disabled={save.isPending}>
            Save location
          </Button>
          {project.location && (
            <Button onClick={clear} disabled={save.isPending}>
              Remove location
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
