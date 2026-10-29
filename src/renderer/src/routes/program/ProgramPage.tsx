// /program: the overview. Cycle, linked projects, corrective action counts and the proposal.
import { useState } from 'react'
import { Link } from 'react-router'
import { Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { refreshProgramQueries } from '../../state/program'
import { countActions, todayIso } from './action-table'
import { ProgramFrame, type ProgramContext } from './ProgramFrame'
import { ProjectsCard } from './ProjectsCard'
import { ProposalCard } from './ProposalCard'

function SettingsDialog(props: { ctx: ProgramContext; open: boolean; onClose: () => void }) {
  const { program } = props.ctx.summary
  const [name, setName] = useState(program.name)
  const [orgName, setOrgName] = useState(program.orgName)
  const [startYear, setStartYear] = useState(String(program.cycle.startYear))
  const [years, setYears] = useState(String(program.cycle.years))
  const [lock, setLock] = useState(program.lock)
  const [error, setError] = useState('')
  const save = async () => {
    if (!name.trim()) return setError('The program needs a name.')
    try {
      await call('program:update', {
        programPath: props.ctx.programPath,
        baseUpdatedAt: program.updatedAt,
        patch: {
          name: name.trim(),
          orgName: orgName.trim(),
          cycle: { startYear: Number(startYear), years: Number(years) },
          lock,
        },
      })
      await refreshProgramQueries()
      props.onClose()
    } catch (e) {
      setError(errorText(e))
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Program settings"
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Program name">
          {({ id }) => (
            <input
              id={id}
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </Field>
        <Field label="Organization">
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
        <label className="row">
          <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
          <span>
            Show others when I have this program open (writes a small file with this computer's name
            into the folder)
          </span>
        </label>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

function Counts({ ctx }: { ctx: ProgramContext }) {
  const list = useIpcQuery('program:actions-list', { programPath: ctx.programPath })
  const counts = list.data ? countActions(list.data.actions, todayIso()) : undefined
  const cell = (label: string, value: number | undefined) => (
    <div className="program-count">
      <dd>{value ?? '–'}</dd>
      <dt>{label}</dt>
    </div>
  )
  return (
    <section className="card" aria-labelledby="program-counts">
      <div className="row program-between">
        <h2 id="program-counts">Corrective actions</h2>
        <Link className="btn btn--sm" to="/program/actions">
          Open the list
        </Link>
      </div>
      <dl className="program-counts">
        {cell('Open', counts?.byStatus.open)}
        {cell('In progress', counts?.byStatus.in_progress)}
        {cell('Overdue', counts?.overdue)}
        {cell('Completed', counts?.byStatus.completed)}
        {cell('Verified', counts?.byStatus.verified)}
      </dl>
      {list.data && list.data.problems.length > 0 && (
        <p className="field__error" role="alert">
          {list.data.problems.length} file(s) in the program folder could not be read:{' '}
          {list.data.problems[0]}
        </p>
      )}
    </section>
  )
}

export default function ProgramPage() {
  const [settings, setSettings] = useState(false)
  const close = () =>
    call('program:close', undefined).then(refreshProgramQueries, (e: unknown) =>
      toast.error('Could not close the program', e),
    )
  return (
    <ProgramFrame
      title="Exercise program"
      description="Corrective actions from every exercise, and the multi-year schedule."
      actions={() => (
        <>
          <Button onClick={() => setSettings(true)}>Settings</Button>
          <Button onClick={() => void close()}>Close program</Button>
        </>
      )}
    >
      {(ctx) => (
        <div className="stack">
          <p className="muted program-folder">
            Cycle {ctx.summary.program.cycle.startYear}–
            {ctx.summary.program.cycle.startYear + ctx.summary.program.cycle.years - 1}. Folder:{' '}
            <code title={ctx.programPath}>{ctx.programPath}</code>
          </p>
          <Counts ctx={ctx} />
          <ProjectsCard ctx={ctx} />
          <ProposalCard ctx={ctx} />
          <SettingsDialog
            key={ctx.summary.program.updatedAt}
            ctx={ctx}
            open={settings}
            onClose={() => setSettings(false)}
          />
        </div>
      )}
    </ProgramFrame>
  )
}
