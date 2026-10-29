// "What to do next" bar on the scenario page (#227): write injects → render media → fix lint
// errors → export / facilitate, with live counts. The same jobs as the Injects tab buttons;
// the stage controls stay under Advanced information for power users.
import { Check, Circle, Download, Presentation } from 'lucide-react'
import { Link } from 'react-router'
import type { JobKind } from '@shared/schemas/job'
import { Term } from '../../components/Glossary'
import { toast } from '../../components/toast-store'
import { Button, ProgressBar } from '../../components/ui'
import { call, IpcError } from '../../lib/api'
import { useScenarioJob } from '../../editors/inject/use-scenario-job'
import { projectKey } from '../../state/project'
import { isReadyNext, type Readiness } from './readiness'

const JOB_LABEL: Partial<Record<JobKind, string>> = {
  'generate-scenario': 'Generating the scenario',
  'rerun-stage': 'Re-running a stage',
  'generate-injects': 'Writing injects',
  'render-media': 'Rendering media',
  'repair-scenario': 'Repairing the scenario',
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function Steps({ r }: { r: Readiness }) {
  const steps = [
    { label: `Timeline: ${plural(r.rows, 'event')}`, done: r.rows > 0 },
    { label: `Injects written: ${r.written}/${r.rows}`, done: r.rows > 0 && r.written === r.rows },
    {
      label: `Media rendered: ${r.rendered}/${r.rows}`,
      done: r.rows > 0 && r.rendered === r.rows,
    },
    {
      label:
        (r.errors ? `Checks: ${plural(r.errors, 'error')}` : 'Checks: no errors') +
        (r.unsupported ? ` · ${plural(r.unsupported, 'item')} without plan support` : ''),
      done: r.errors === 0,
    },
  ]
  return (
    <ol className="next-bar__steps" aria-label="Progress">
      {steps.map((s) => (
        <li key={s.label} data-done={s.done || undefined}>
          {s.done ? <Check size={14} aria-hidden /> : <Circle size={10} aria-hidden />}
          <span>{s.label}</span>
          <span className="sr-only">{s.done ? ' (done)' : ' (to do)'}</span>
        </li>
      ))}
    </ol>
  )
}

function useStartJob(
  projectPath: string,
  scenarioId: string,
  track: (id: string, k: JobKind) => void,
  onJob: (jobId: string) => void,
) {
  return async (kind: 'generate-injects' | 'render-media' | 'evaluation') => {
    try {
      // The eeg stage alone (#421): nothing downstream depends on it, so the scenario stays ready.
      const { jobId } =
        kind === 'generate-injects'
          ? await call('generate:injects', { projectPath, scenarioId })
          : kind === 'render-media'
            ? await call('generate:media', { projectPath, scenarioId })
            : await call('generate:rerun-stage', { projectPath, scenarioId, stage: 'eeg' })
      track(jobId, kind === 'evaluation' ? 'rerun-stage' : kind)
      onJob(jobId)
    } catch (e) {
      const conflict = e instanceof IpcError && e.code === 'CONFLICT'
      toast.error(
        conflict ? 'A generation job is already running for this scenario' : 'Could not start',
        e,
      )
    }
  }
}

function headline(r: Readiness): string {
  switch (r.next) {
    case 'msel':
      return 'Next: build the timeline'
    case 'write-injects':
      return `Next: write ${plural(r.rows - r.written, 'inject')}`
    case 'render-media':
      return `Next: render media (${r.rendered}/${r.rows})`
    case 'fix-errors':
      return `Next: fix ${plural(r.errors, 'error')} found by the checks`
    case 'evaluation':
      return 'Ready. Next: generate the evaluation guides'
    case 'run':
      return 'Ready: export or facilitate'
  }
}

export function NextActionBar(props: {
  projectPath: string
  scenarioId: string
  readiness: Readiness
  onShowTab: (tab: string) => void
  onJob: (jobId: string) => void
}) {
  const { projectPath, scenarioId, readiness: r } = props
  const { job, track } = useScenarioJob(projectPath, scenarioId)
  const start = useStartJob(projectPath, scenarioId, track, props.onJob)
  const base = `/p/${projectKey(projectPath)}/scenarios/${scenarioId}`
  const busy = !!job
  const title = job ? `${JOB_LABEL[job.kind] ?? 'Working'}…` : headline(r)
  return (
    <section className="next-bar card" aria-labelledby="next-bar-title" data-next={r.next}>
      <div className="next-bar__text">
        <h2 id="next-bar-title" className="next-bar__title">
          {title}
        </h2>
        {job ? (
          <ProgressBar value={job.progress} label={`${JOB_LABEL[job.kind] ?? 'Job'} progress`} />
        ) : (
          <Hint r={r} />
        )}
        <Steps r={r} />
      </div>
      <div className="next-bar__actions">
        {r.next === 'msel' && (
          <Button onClick={() => props.onShowTab('msel')}>Open the MSEL</Button>
        )}
        {r.next === 'write-injects' && (
          <Button variant="primary" disabled={busy} onClick={() => void start('generate-injects')}>
            Write {plural(r.rows - r.written, 'inject')}
          </Button>
        )}
        {r.next === 'render-media' && (
          <Button variant="primary" disabled={busy} onClick={() => void start('render-media')}>
            Render media
          </Button>
        )}
        {r.next === 'fix-errors' && (
          <Button variant="primary" onClick={() => props.onShowTab('warnings')}>
            Show the errors
          </Button>
        )}
        {r.next === 'evaluation' && (
          <Button variant="primary" disabled={busy} onClick={() => void start('evaluation')}>
            Generate evaluation guides
          </Button>
        )}
        {isReadyNext(r.next) && (
          <>
            <Link className="btn" to={`${base}/facilitate`}>
              <Presentation size={16} aria-hidden /> Facilitate
            </Link>
            <Link className={r.next === 'run' ? 'btn btn--primary' : 'btn'} to={`${base}/export`}>
              <Download size={16} aria-hidden /> Export…
            </Link>
          </>
        )}
      </div>
    </section>
  )
}

function Hint({ r }: { r: Readiness }) {
  if (r.next === 'msel')
    return (
      <p className="muted">
        The <Term id="msel" /> lists every event of the exercise. Generate it from the stages under
        Advanced information, or add rows by hand.
      </p>
    )
  if (r.next === 'write-injects')
    return (
      <p className="muted">
        Each event becomes an <Term id="inject">inject</Term>: the email, call or post the players
        receive. You can edit any of them afterwards.{' '}
        <Link to="/settings">Do this automatically after generation</Link>
      </p>
    )
  if (r.next === 'render-media')
    return (
      <p className="muted">
        Turns each inject into the picture, document or audio you hand to players.
      </p>
    )
  if (r.next === 'fix-errors')
    return (
      <p className="muted">
        The automatic checks (<Term id="lint">lint</Term>) found problems players would notice. You
        can still export.
      </p>
    )
  if (r.next === 'evaluation')
    return (
      <p className="muted">
        Exercise Evaluation Guides map each objective to FEMA Core Capabilities and list the actions
        your plans require, with citations, for evaluators to rate during the exercise. One model
        call; nothing else in the scenario changes.
      </p>
    )
  return (
    <p className="muted">
      Every event has an inject with media, and the checks found no errors.
      {r.warnings > 0 && ` ${plural(r.warnings, 'suggestion')} remain under Warnings.`}
    </p>
  )
}
