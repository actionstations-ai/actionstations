// Before a program is active: create one (the folder name and place are the user's choice) or
// open one that is already on this computer or on a shared drive.
import { useState } from 'react'
import { Button, Dialog, EmptyState, Field } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { refreshProgramQueries } from '../../state/program'
import { openProgramAt } from './program-helpers'

const dirOf = (p: string): string => p.replace(/[\\/][^\\/]*$/, '')

export function CreateProgramDialog(props: { open: boolean; onClose: () => void }) {
  const settings = useIpcQuery('settings:get', undefined)
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [startYear, setStartYear] = useState(String(new Date().getFullYear()))
  const [years, setYears] = useState('3')
  const [parentDir, setParentDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const where = parentDir || settings.data?.defaultProjectsDir || ''

  const choose = async () => {
    const picked = await call('dialog:open-directory', {
      title: 'Where should the program folder go?',
      ...(where ? { defaultPath: where } : {}),
    })
    if (picked) setParentDir(picked)
  }
  const submit = async () => {
    if (!name.trim()) return setError('Give the program a name.')
    if (!where) return setError('Choose where to keep the program folder.')
    setBusy(true)
    setError('')
    try {
      await call('program:create', {
        parentDir: where,
        name: name.trim(),
        orgName: orgName.trim(),
        startYear: Number(startYear),
        years: Number(years),
      })
      await refreshProgramQueries()
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Create an exercise program"
      description="The program is a folder you choose. Put it on a shared drive if others will use it. Nothing is created until you press Create."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void submit()}>
            {busy ? 'Creating…' : 'Create program'}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Program name" hint="For example: Summit County Exercise Program">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              value={name}
              aria-describedby={describedBy}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Organization (optional)">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          )}
        </Field>
        <div className="row program-form-row">
          <Field label="First year of the cycle">
            {({ id }) => (
              <input
                id={id}
                className="input"
                inputMode="numeric"
                value={startYear}
                onChange={(e) => setStartYear(e.target.value)}
              />
            )}
          </Field>
          <Field label="Years in the cycle">
            {({ id }) => (
              <select
                id={id}
                className="select"
                value={years}
                onChange={(e) => setYears(e.target.value)}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <div className="field">
          <span className="field__label">Folder location</span>
          <div className="row">
            <code className="program-path" title={where}>
              {where || 'Not chosen yet'}
            </code>
            <Button size="sm" onClick={() => void choose()}>
              Choose…
            </Button>
          </div>
        </div>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

export function ProgramSetup() {
  const settings = useIpcQuery('settings:get', undefined)
  const [creating, setCreating] = useState(false)
  const recent = settings.data?.program.recent ?? []
  const choose = async () => {
    const picked = await call('dialog:open-directory', { title: 'Open an exercise program folder' })
    if (picked) await openProgramAt(picked)
  }
  return (
    <div className="page page--wide program-page">
      <EmptyState
        title="No exercise program yet"
        body="A program keeps corrective actions from every exercise in one list, with owners, due dates and a multi-year schedule. It is optional: projects work the same without one."
        actions={
          <>
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create a program
            </Button>
            <Button onClick={() => void choose()}>Open a program folder…</Button>
          </>
        }
      />
      {recent.length > 0 && (
        <section aria-labelledby="program-recent" className="program-recent">
          <h2 id="program-recent">Recent programs</h2>
          <ul className="stack">
            {recent.map((r) => (
              <li key={r.path} className="card row">
                <span>
                  <strong>{r.name}</strong>
                  <br />
                  <span className="muted program-path" title={r.path}>
                    {dirOf(r.path)}
                  </span>
                </span>
                <Button size="sm" onClick={() => void openProgramAt(r.path)}>
                  Open
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <CreateProgramDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
