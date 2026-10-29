// Linked projects (FR-3): link one from the recent projects, unlink, and refresh the snapshots.
import { useState } from 'react'
import { Badge, Button, Dialog } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { refreshProgramQueries } from '../../state/program'
import type { ProgramContext } from './ProgramFrame'

function LinkDialog(props: { ctx: ProgramContext; open: boolean; onClose: () => void }) {
  const recent = useIpcQuery('project:list-recent', undefined)
  const linked = new Set(props.ctx.summary.program.projects.map((p) => p.name))
  const [busy, setBusy] = useState('')
  const choices = (recent.data ?? []).filter((r) => !linked.has(r.name))
  const link = async (projectPath: string) => {
    setBusy(projectPath)
    try {
      await call('program:link-project', { programPath: props.ctx.programPath, projectPath })
      await refreshProgramQueries()
      props.onClose()
    } catch (e) {
      toast.error('Could not link the project', e)
    } finally {
      setBusy('')
    }
  }
  return (
    <Dialog
      open={props.open}
      onOpenChange={(o) => !o && props.onClose()}
      title="Link a project"
      description="A project belongs to at most one program. Its scenarios and plan sections then count toward the program's proposals."
      footer={<Button onClick={props.onClose}>Close</Button>}
    >
      {choices.length === 0 ? (
        <p>No other recent projects. Open a project first, then link it here.</p>
      ) : (
        <ul className="stack">
          {choices.map((r) => (
            <li key={r.path} className="row program-between">
              <span>
                <strong>{r.name}</strong>
                <br />
                <span className="muted program-path" title={r.path}>
                  {r.path}
                </span>
              </span>
              <Button size="sm" disabled={!!busy} onClick={() => void link(r.path)}>
                {busy === r.path ? 'Linking…' : `Link ${r.name}`}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

export function ProjectsCard({ ctx }: { ctx: ProgramContext }) {
  const [linking, setLinking] = useState(false)
  const [busy, setBusy] = useState(false)
  const { program, reachable } = ctx.summary
  const refresh = async () => {
    setBusy(true)
    try {
      await call('program:refresh', { programPath: ctx.programPath })
      await refreshProgramQueries()
      toast.success('Project snapshots refreshed')
    } catch (e) {
      toast.error('Could not refresh the snapshots', e)
    } finally {
      setBusy(false)
    }
  }
  const unlink = async (projectId: string, name: string) => {
    try {
      await call('program:unlink-project', { programPath: ctx.programPath, projectId })
      await refreshProgramQueries()
      toast.success(`${name} unlinked`, 'Its corrective actions stay in the program.')
    } catch (e) {
      toast.error('Could not unlink the project', e)
    }
  }
  return (
    <section className="card" aria-labelledby="program-projects">
      <div className="row program-between">
        <h2 id="program-projects">Projects ({program.projects.length})</h2>
        <div className="row">
          <Button size="sm" onClick={() => setLinking(true)}>
            Link project…
          </Button>
          <Button
            size="sm"
            disabled={busy || !program.projects.length}
            onClick={() => void refresh()}
          >
            {busy ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>
      {program.projects.length === 0 ? (
        <p className="muted">
          No projects linked. A linked project lets the program see its scenarios, plan sections and
          after-action reports.
        </p>
      ) : (
        <ul className="stack">
          {program.projects.map((l) => (
            <li key={l.projectId} className="row program-between">
              <span>
                {l.name}{' '}
                {reachable[l.projectId] ? (
                  <Badge tone="ok">Found</Badge>
                ) : (
                  <Badge tone="warn">Not found on this computer</Badge>
                )}
              </span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Unlink ${l.name}`}
                onClick={() => void unlink(l.projectId, l.name)}
              >
                Unlink
              </Button>
            </li>
          ))}
        </ul>
      )}
      <LinkDialog ctx={ctx} open={linking} onClose={() => setLinking(false)} />
    </section>
  )
}
