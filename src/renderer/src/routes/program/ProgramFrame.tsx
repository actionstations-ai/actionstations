// The frame every Program screen shares: the page header, the tabs, the "Also open by" notice,
// and the setup card shown before a program is chosen. The folder is never created or read
// before the user picks it in a dialog (FR-1).
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import type { OpenProgram } from '@shared/ipc'
import { Button, EmptyState, PageHeader } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { toast } from '../../components/toast-store'
import { refreshProgramQueries, useActiveProgram, useProgramEvents } from '../../state/program'
import { ProgramSetup } from './ProgramSetup'
import './program.css'

export interface ProgramContext {
  programPath: string
  summary: OpenProgram
}

const TABS = [
  { to: '/program', label: 'Overview', end: true },
  { to: '/program/actions', label: 'Corrective actions', end: false },
  { to: '/program/schedule', label: 'Schedule', end: false },
  { to: '/program/health', label: 'Health', end: false },
]

function Tabs() {
  return (
    <nav aria-label="Program sections" className="program-tabs">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} className="program-tabs__link">
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

function LockNotice({ summary }: { summary: OpenProgram }) {
  if (!summary.lock) return null
  const who = summary.lock.user ? `${summary.lock.host} (${summary.lock.user})` : summary.lock.host
  return (
    <p className="program-lock" role="status">
      Also open by {who}. You can keep editing; if you both change the same item, the app asks which
      version to keep.
    </p>
  )
}

function Broken({ error }: { error: unknown }) {
  const close = () =>
    call('program:close', undefined).then(refreshProgramQueries, (e: unknown) =>
      toast.error('Could not close the program', e),
    )
  return (
    <EmptyState
      title="This program could not be opened"
      body={errorText(error)}
      actions={<Button onClick={() => void close()}>Choose another program</Button>}
    />
  )
}

export function ProgramFrame(props: {
  title: ReactNode
  description?: ReactNode
  actions?: (ctx: ProgramContext) => ReactNode
  children: (ctx: ProgramContext) => ReactNode
}) {
  useProgramEvents()
  const { programPath, summary, loading, error } = useActiveProgram()
  if (loading)
    return (
      <div className="page page--wide">
        <p role="status">Loading…</p>
      </div>
    )
  if (!programPath) return <ProgramSetup />
  if (error || !summary)
    return (
      <div className="page page--wide">
        <Broken error={error} />
      </div>
    )
  const ctx = { programPath, summary }
  return (
    <div className="page page--wide program-page">
      <PageHeader
        eyebrow={summary.program.name}
        title={props.title}
        description={props.description}
        actions={props.actions?.(ctx)}
      />
      <Tabs />
      <LockNotice summary={summary} />
      {props.children(ctx)}
    </div>
  )
}
