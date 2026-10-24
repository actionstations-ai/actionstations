// One local tool (ADR-0021, #334): what it does, size, license, and its state: Detected,
// Installed but not running (Start), or Not installed (Download and install / Open the
// download page / Skip). Nothing happens without a click.
import { useState } from 'react'
import type { ToolView } from '@shared/schemas/setup'
import type { SetupInstallResult } from '@shared/ipc'
import { call } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { errorText } from '../../lib/errors'
import { isRunning } from '../../state/jobs'
import { CancelJobButton } from '../CancelJobButton'
import { toast } from '../toast-store'
import { Badge, Button, ProgressBar } from '../ui'
import { startInstall, toolKey, useKeyedJob } from './use-local-tools'

const STATE_LABEL: Record<ToolView['state'], string> = {
  running: 'Detected',
  installed: 'Installed, not running',
  missing: 'Not installed',
}
const STATE_TONE = { running: 'ok', installed: 'warn', missing: 'neutral' } as const

function installedMessage(r: SetupInstallResult | undefined): string {
  if (!r) return 'Installed.'
  const hash = r.sha256Checked ? ' and the published sha256' : ''
  if (r.installerOpened)
    return `The installer is open (signed by ${r.signer}${hash ? `, checked against${hash}` : ''}). Follow it, then press Detect again.`
  return `Installed to ${r.installedAt ?? 'Applications'} after checking the signature (${r.signer})${hash}. Press Start to run it.`
}

function InstallProgress({ tool }: { tool: ToolView }) {
  const job = useKeyedJob('tool-install', toolKey(tool.id))
  if (!job) return null
  if (isRunning(job))
    return (
      <div className="lt-progress stack" aria-live="polite">
        <ProgressBar value={job.progress} label={`Installing ${tool.name}`} />
        <div className="row">
          <span className="muted">{job.message}</span>
          <CancelJobButton jobId={job.id} ariaLabel={`Cancel installing ${tool.name}`} />
        </div>
      </div>
    )
  if (job.status === 'error')
    return (
      <p className="field__error" role="alert">
        {errorText(job.error ?? 'The install failed.')}
      </p>
    )
  if (job.status === 'cancelled')
    return <p className="muted">Install cancelled. Nothing was installed.</p>
  if (job.status === 'done')
    return (
      <p role="status" className="lt-ok">
        {installedMessage(job.result as SetupInstallResult | undefined)}
      </p>
    )
  return null
}

function StartButton({ tool }: { tool: ToolView }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const start = async () => {
    setBusy(true)
    setNote(null)
    try {
      const r = await call('setup:start', { tool: tool.id })
      setNote({ ok: r.running, text: r.message })
      await queryClient.invalidateQueries({ queryKey: ['setup:status'] })
    } catch (err) {
      setNote({ ok: false, text: errorText(err) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button size="sm" variant="primary" disabled={busy} onClick={() => void start()}>
        {busy ? 'Starting…' : `Start ${tool.name}`}
      </Button>
      {note && (
        <p role="status" className={note.ok ? 'lt-ok' : 'muted'}>
          {note.text}
        </p>
      )}
    </>
  )
}

function MissingActions(props: { tool: ToolView; busy: boolean; onSkip: () => void }) {
  const t = props.tool
  const openPage = () =>
    call('setup:open-page', { tool: t.id }).catch((err: unknown) =>
      toast.error('Could not open the download page', err),
    )
  return (
    <div className="row lt-actions">
      {t.method === 'install' && (
        <Button
          size="sm"
          variant="primary"
          disabled={props.busy}
          onClick={() => void startInstall(t.id)}
        >
          Download and install
        </Button>
      )}
      {t.method !== 'unsupported' && (
        <Button size="sm" onClick={() => void openPage()}>
          Open the download page
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={props.onSkip}>
        Skip
      </Button>
    </div>
  )
}

export function ToolRow(props: { tool: ToolView; onSkip: () => void }) {
  const t = props.tool
  const job = useKeyedJob('tool-install', toolKey(t.id))
  const installing = isRunning(job)
  const headingId = `lt-tool-${t.id}`
  return (
    <li className="lt-tool" aria-labelledby={headingId}>
      <div className="lt-tool__head">
        <h4 id={headingId} className="lt-tool__name">
          {t.name}
        </h4>
        <Badge tone={STATE_TONE[t.state]}>{STATE_LABEL[t.state]}</Badge>
      </div>
      <p>{t.purpose}</p>
      <dl className="lt-facts">
        <div>
          <dt>Size</dt>
          <dd>{t.sizeLabel}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>
            <a href={t.licenseUrl} target="_blank" rel="noreferrer">
              {t.license}
            </a>
          </dd>
        </div>
        {t.state === 'running' && t.baseUrl && (
          <div>
            <dt>Running at</dt>
            <dd className="mono">{t.baseUrl}</dd>
          </div>
        )}
        {t.state === 'installed' && t.foundAt && (
          <div>
            <dt>Found at</dt>
            <dd className="mono">{t.foundAt}</dd>
          </div>
        )}
      </dl>
      {t.state === 'installed' &&
        (t.canStart ? (
          <div className="row lt-actions">
            <StartButton tool={t} />
          </div>
        ) : (
          <p className="muted">Start it the way you usually do, then press Detect again.</p>
        ))}
      {t.state === 'missing' && (
        <>
          {t.methodNote && <p className="muted">{t.methodNote}</p>}
          {t.command && (
            <p>
              Command: <code className="mono">{t.command}</code>
            </p>
          )}
          {t.method === 'install' && t.verification && <p className="muted">{t.verification}</p>}
          <MissingActions tool={t} busy={installing} onSkip={props.onSkip} />
        </>
      )}
      <InstallProgress tool={t} />
    </li>
  )
}
