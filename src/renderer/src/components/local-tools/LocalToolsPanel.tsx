// The local tools list and recommended models (ADR-0021, #334), shared by the setup wizard
// and Settings. Only mounted for "Local tools" or "A mix": Cloud APIs only never detects,
// downloads or installs anything.
import type { SetupSettings, ToolId } from '@shared/schemas/setup'
import { errorText } from '../../lib/errors'
import { toast } from '../toast-store'
import { Button } from '../ui'
import { ModelList } from './ModelList'
import { ToolRow } from './ToolRow'
import { hardwareSummary, saveSetup, useSetupStatus } from './use-local-tools'
import './local-tools.css'

export function LocalToolsPanel(props: { setup: SetupSettings }) {
  const status = useSetupStatus(true)
  const skipped = props.setup.skipped
  const setSkipped = (next: ToolId[]) =>
    saveSetup({ skipped: next }).catch((err: unknown) => toast.error('Could not save', err))
  const tools = status.data?.tools ?? []
  const shown = tools.filter((t) => !skipped.includes(t.id))
  const hidden = tools.filter((t) => skipped.includes(t.id))
  return (
    <div className="stack lt-panel">
      <div className="row lt-panel__head">
        <h3>Local tools</h3>
        <Button size="sm" onClick={() => void status.refetch()} disabled={status.isFetching}>
          {status.isFetching ? 'Detecting…' : 'Detect again'}
        </Button>
      </div>
      <p className="muted">
        Each tool is optional. Downloads come only from the vendor&rsquo;s official site, start only
        when you press a button, and the publisher signature is checked before anything runs. Your
        computer asks for an administrator password itself if an installer needs one.
      </p>
      {status.isError && (
        <p className="field__error" role="alert">
          {errorText(status.error)}
        </p>
      )}
      <ul className="lt-tools" aria-label="Local tools" aria-busy={status.isFetching}>
        {shown.map((t) => (
          <ToolRow key={t.id} tool={t} onSkip={() => void setSkipped([...skipped, t.id])} />
        ))}
      </ul>
      {hidden.length > 0 && (
        <div className="row lt-skipped">
          <span className="muted">Skipped: {hidden.map((t) => t.name).join(', ')}</span>
          <Button size="sm" variant="ghost" onClick={() => void setSkipped([])}>
            Show skipped tools
          </Button>
        </div>
      )}
      {status.data && (
        <div className="stack">
          <h3>Recommended models</h3>
          <p className="muted">
            For this computer: {hardwareSummary(status.data.hardware)}. Each download is optional.
          </p>
          <ModelList
            models={status.data.models.filter((m) => !skipped.includes(m.tool))}
            tools={shown}
          />
        </div>
      )}
    </div>
  )
}
