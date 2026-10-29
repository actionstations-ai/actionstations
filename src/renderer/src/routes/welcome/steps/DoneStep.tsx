// Finished: offer to import documents into the new project, plus links to the main areas.
import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { call } from '../../../lib/api'
import { projectKey } from '../../../state/project'
import { IMPORT_FILTERS } from '../../documents/doc-utils'
import { useAction } from '../use-setup'
import { WHAT_IS_SENT } from '../../../components/updates/update-view'
import { setUpdates, useUpdateStatus } from '../../../components/updates/use-updates'

/**
 * The update question (#442), unticked: finishing the wizard stores `off` unless the user
 * ticks it, so the setting never stays "ask" and the Projects screen does not ask again.
 */
function UpdateCheckChoice() {
  const status = useUpdateStatus().data
  const mode = status?.mode
  useEffect(() => {
    if (mode === 'ask') void setUpdates({ check: 'off' }).catch(() => undefined)
  }, [mode])
  if (!status) return null
  const change = (on: boolean) =>
    setUpdates({ check: on ? 'on' : 'off' }).catch((err: unknown) =>
      toast.error('Could not save the update check', err),
    )
  return (
    <div className="card stack">
      <h3>Updates</h3>
      <label className="row">
        <input
          type="checkbox"
          checked={status.mode === 'on'}
          aria-describedby="wizard-update-hint"
          onChange={(e) => void change(e.target.checked)}
        />
        <span>Check for new versions of Action Stations when the app starts</span>
      </label>
      <p id="wizard-update-hint" className="field__hint">
        At most once a day. {WHAT_IS_SENT} You can change this in Settings → Updates.
      </p>
    </div>
  )
}

function ImportDocuments({ projectPath }: { projectPath: string }) {
  const navigate = useNavigate()
  const action = useAction()
  const importDocs = () =>
    action.run(async () => {
      const filePaths = await call('dialog:open-files', {
        title: 'Import documents',
        filters: IMPORT_FILTERS,
        multi: true,
      })
      if (!filePaths.length) return
      const res = await call('documents:import', { projectPath, filePaths })
      toast.success(
        `Importing ${res.documents.length} document${res.documents.length === 1 ? '' : 's'}`,
      )
      void navigate(`/p/${projectKey(projectPath)}/documents`)
    })
  return (
    <div className="card stack">
      <h3>Add your source documents</h3>
      <p className="muted">
        Emergency plans, security programs, incident response procedures, past after-action reports.
        PDF, Word, PowerPoint, Excel, Markdown and images are supported.
      </p>
      <div className="row">
        <Button variant="primary" onClick={() => void importDocs()} disabled={action.busy}>
          {action.busy ? 'Importing…' : 'Import documents…'}
        </Button>
        <Link className="btn" to={`/p/${projectKey(projectPath)}/documents`}>
          Open Documents
        </Link>
      </div>
      {action.error && (
        <p className="field__error" role="alert">
          {action.error}
        </p>
      )}
    </div>
  )
}

export function DoneStep({ projectPath }: { projectPath?: string | undefined }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const generate = projectPath ? `/p/${projectKey(projectPath)}/generate` : '/projects'
  return (
    <section className="wizard-step stack" aria-labelledby="wizard-step-title">
      <div className="stack wizard-step__head">
        <h2 id="wizard-step-title" ref={heading} tabIndex={-1}>
          You&rsquo;re set up
        </h2>
        <p className="wizard-step__intro">
          Everything here can be changed later in Providers and Settings.
        </p>
      </div>
      {projectPath && <ImportDocuments projectPath={projectPath} />}
      <UpdateCheckChoice />
      <nav className="card stack" aria-label="Next steps">
        <h3>Where to next</h3>
        <ul className="wizard-links">
          <li>
            <Link to={generate}>Generate an exercise</Link>
            <span className="muted"> from a brief and your documents.</span>
          </li>
          <li>
            <Link to="/templates">Browse inject templates</Link>
            <span className="muted"> for emails, posts, tickets and screens.</span>
          </li>
          <li>
            <Link to="/providers">Review providers and routing</Link>
            <span className="muted"> to change which model does what.</span>
          </li>
          <li>
            <Link to="/projects">Go to Projects</Link>
          </li>
        </ul>
      </nav>
    </section>
  )
}
