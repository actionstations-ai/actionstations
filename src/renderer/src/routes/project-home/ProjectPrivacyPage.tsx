// Project → Cloud and privacy (#433): this project's review policy and redaction (or the app
// defaults), a sample box that shows redaction live, and the send log.
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { PrivacySettings, RedactionSpan } from '@shared/schemas'
import { SentText } from '../../components/OutboundApprovalDialog'
import { PrivacyEditor } from '../../components/privacy/PrivacyEditor'
import { useRemoteProviderLabels } from '../../components/privacy/use-remote-providers'
import { toast } from '../../components/toast-store'
import { Field, PageHeader } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { CloudPrivacySummary } from './CloudPrivacySummary'
import { CloudSends } from './CloudSends'
import { NeverSendCard } from './NeverSendCard'
import '../../components/privacy/privacy.css'

const SAMPLE_DELAY_MS = 300

/** Type text, see what would be replaced with these settings. Nothing is sent anywhere. */
export function RedactionSample({ projectPath }: { projectPath: string }) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<{ text: string; spans: RedactionSpan[] } | null>(null)
  const [error, setError] = useState('')
  const settings = useIpcQuery('privacy:get', { projectPath })
  const shown = text.trim() ? result : null
  useEffect(() => {
    if (!text.trim()) return
    let live = true
    const t = setTimeout(() => {
      call('privacy:preview-redaction', { projectPath, text })
        .then((r) => {
          if (!live) return
          setResult(r)
          setError('')
        })
        .catch((e: unknown) => {
          if (live) setError(errorText(e))
        })
    }, SAMPLE_DELAY_MS)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [text, projectPath, settings.data])
  return (
    <section className="card stack" aria-labelledby="redaction-sample-heading">
      <h2 id="redaction-sample-heading">Try redaction</h2>
      <Field
        label="Sample text"
        hint="Paste a paragraph from a plan to see what would be replaced. This stays on your computer."
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            className="input"
            rows={4}
            maxLength={20_000}
            aria-describedby={describedBy}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      <div aria-live="polite">
        {error && <p className="field__error">{error}</p>}
        {shown && (
          <>
            <p className="muted">
              {shown.spans.length === 0
                ? 'Nothing would be replaced.'
                : `${shown.spans.length} ${shown.spans.length === 1 ? 'value' : 'values'} would be replaced.`}
            </p>
            <SentText text={shown.text} spans={shown.spans} />
          </>
        )}
      </div>
    </section>
  )
}

function ProjectPrivacySettings({ projectPath }: { projectPath: string }) {
  const view = useIpcQuery('privacy:get', { projectPath })
  const remote = useRemoteProviderLabels(projectPath)
  const set = useIpcMutation('privacy:set', { invalidates: ['privacy:get'] })
  const [overriding, setOverriding] = useState<boolean | null>(null)
  if (view.isError)
    return (
      <p className="field__error" role="alert">
        {errorText(view.error)}
      </p>
    )
  if (!view.data) return <p className="muted">Loading…</p>
  const hasOverride = !!view.data.project && Object.keys(view.data.project).length > 0
  const on = overriding ?? hasOverride
  const save = (settings: PrivacySettings, confirmOff?: true) =>
    set.mutate(
      { projectPath, settings, ...(confirmOff ? { confirmOff } : {}) },
      {
        onSuccess: () => toast.success('Project privacy settings saved'),
        onError: (err) => toast.error('Could not save privacy settings', err),
      },
    )
  const toggle = (next: boolean) => {
    setOverriding(next)
    if (!next && hasOverride)
      set.mutate(
        { projectPath, settings: {}, clear: true },
        {
          onSuccess: () => toast.success('This project now uses the app defaults'),
          onError: (err) => toast.error('Could not save privacy settings', err),
        },
      )
  }
  return (
    <section className="card stack" aria-labelledby="project-privacy-heading">
      <div>
        <h2 id="project-privacy-heading">Review and redaction</h2>
        <p className="muted">
          The app defaults are in <Link to="/settings#privacy">Settings → Privacy</Link>. Settings
          here are saved in the project file and travel with it.
        </p>
      </div>
      <label className="row">
        <input
          type="checkbox"
          checked={on}
          disabled={set.isPending}
          onChange={(e) => toggle(e.target.checked)}
        />
        Use different settings for this project
      </label>
      {on && (
        <PrivacyEditor
          key={JSON.stringify(view.data.effective)}
          value={view.data.effective}
          remoteProviders={remote}
          saving={set.isPending}
          saveLabel="Save project settings"
          onSave={save}
        />
      )}
    </section>
  )
}

export default function ProjectPrivacyPage() {
  const projectPath = fromProjectKey(useParams().projectKey ?? '')
  return (
    <div className="page page--wide">
      <PageHeader
        eyebrow="Project"
        title="Cloud and privacy"
        description="What this project sends to cloud providers, how you review it, and a record of every send. Local providers are not affected."
      />
      <CloudPrivacySummary projectPath={projectPath} />
      <ProjectPrivacySettings projectPath={projectPath} />
      <NeverSendCard projectPath={projectPath} />
      <RedactionSample projectPath={projectPath} />
      <CloudSends projectPath={projectPath} />
    </div>
  )
}
