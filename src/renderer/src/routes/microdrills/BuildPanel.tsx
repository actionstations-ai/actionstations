// Build a short drill (#437, FR-1 to FR-3): pick one document and one section of it (the annex),
// set the audience, length, mode and number of questions, and start the build job. A section
// over the size limit cannot be picked.
import { useState } from 'react'
import { MICRO_DRILL_LIMITS, type MicroDrillSettings } from '@shared/schemas'
import { Button, Field, ProgressBar } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { useJobSettled, useTrackedJob } from '../../state/use-jobs'

const DEFAULTS: MicroDrillSettings = {
  audience: 'new_staff',
  durationMin: 15,
  mode: 'solo',
  stepCount: 4,
  focus: '',
}

export function BuildPanel(props: { projectPath: string; onBuilt: (drillId: string) => void }) {
  const { projectPath, onBuilt } = props
  const docs = useIpcQuery('documents:list', { projectPath })
  const [documentId, setDocumentId] = useState('')
  const [headingPath, setHeadingPath] = useState('')
  const [settings, setSettings] = useState<MicroDrillSettings>(DEFAULTS)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useTrackedJob(jobId)
  const annexes = useIpcQuery(
    'microdrills:annexes',
    { projectPath, documentId },
    { enabled: !!documentId },
  )
  useJobSettled(
    (j) => j.id === jobId,
    (e, j) => {
      if (e.status === 'done') {
        toast.success('Drill built', 'Read every question and hint before you mark it Ready.')
        const id = (j.result as { id?: string } | undefined)?.id
        if (id) onBuilt(id)
      } else if (e.status === 'error') toast.error('Could not build the drill', job?.error ?? '')
    },
  )
  const running = !!job && (job.status === 'running' || job.status === 'queued')
  const usable = (docs.data ?? []).filter((d) => d.status === 'ok')
  const set = <K extends keyof MicroDrillSettings>(key: K, value: MicroDrillSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }))
  const build = async () => {
    try {
      const r = await call('microdrills:build', { projectPath, documentId, headingPath, settings })
      setJobId(r.jobId)
    } catch (e) {
      toast.error('Could not start', errorText(e))
    }
  }
  return (
    <section className="card stack" aria-labelledby="micro-build-title">
      <h2 id="micro-build-title" className="section-title">
        Build a drill
      </h2>
      <p className="muted">
        Pick one section of one plan. The drill is written from that section only, and you review
        every question and hint before anyone runs it.
      </p>
      <div className="micro-form">
        <Field label="Plan document">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={documentId}
              onChange={(e) => {
                setDocumentId(e.target.value)
                setHeadingPath('')
              }}
            >
              <option value="">Choose a document</option>
              {usable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Section (the annex)"
          hint={`Up to ${MICRO_DRILL_LIMITS.annexTokens.toLocaleString('en-US')} tokens. A larger section needs a narrower pick.`}
        >
          {({ id, describedBy }) => (
            <select
              id={id}
              className="select"
              aria-describedby={describedBy}
              disabled={!documentId || annexes.isPending}
              value={headingPath}
              onChange={(e) => setHeadingPath(e.target.value)}
            >
              <option value="">Choose a section</option>
              {(annexes.data ?? []).map((a) => (
                <option key={a.headingPath} value={a.headingPath} disabled={a.tooLarge}>
                  {a.headingPath} ({a.tokens.toLocaleString('en-US')} tokens
                  {a.tooLarge ? ', too large' : ''})
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Audience">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={settings.audience}
              onChange={(e) => set('audience', e.target.value as MicroDrillSettings['audience'])}
            >
              <option value="new_staff">New staff</option>
              <option value="refresher">Refresher</option>
            </select>
          )}
        </Field>
        <Field label="Planned length">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={settings.durationMin}
              onChange={(e) =>
                set('durationMin', Number(e.target.value) as MicroDrillSettings['durationMin'])
              }
            >
              {[10, 15, 20].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Who runs it">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={settings.mode}
              onChange={(e) => set('mode', e.target.value as MicroDrillSettings['mode'])}
            >
              <option value="solo">One person</option>
              <option value="team">A team of two to six around one screen</option>
            </select>
          )}
        </Field>
        <Field label="Questions">
          {({ id }) => (
            <select
              id={id}
              className="select"
              value={settings.stepCount}
              onChange={(e) => set('stepCount', Number(e.target.value))}
            >
              {[3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Focus (optional)" hint="For example: notification deadlines.">
          {({ id, describedBy }) => (
            <input
              id={id}
              className="input"
              aria-describedby={describedBy}
              maxLength={200}
              value={settings.focus}
              onChange={(e) => set('focus', e.target.value)}
            />
          )}
        </Field>
      </div>
      <div className="row">
        <Button variant="primary" disabled={!headingPath || running} onClick={() => void build()}>
          Build drill
        </Button>
        {running && (
          <div className="micro-progress">
            <ProgressBar value={job.progress ?? 0} label="Building the drill" />
            <span className="muted" role="status">
              {job.message}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}
