// Generation stages of a scenario: the latest run per (stage, item), with re-run and
// "Continue from failure". Per-inject stages (one run per inject) are collapsed into one
// group per stage with ok/error/stale counts; groups with errors start expanded. The head
// also has "Repair this scenario" (#200) and, while a repair runs, its job banner; reported
// costs of remote providers show next to the tokens (#218).
import { useId, useState } from 'react'
import { ChevronDown, ChevronRight, RotateCcw, Play } from 'lucide-react'
import type { StageRun } from '@shared/schemas/scenario'
import { Badge, Button, Dialog, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { JobBanner } from '../../editors/inject/JobBanner'
import { useScenarioJob } from '../../editors/inject/use-scenario-job'
import { RepairScenario } from './RepairScenario'
import {
  itemLabel,
  latestRuns,
  runCost,
  runDuration,
  runTokens,
  stageLabel,
  timelineEntries,
  totalCost,
  type StatusCounts,
} from './stages'

const STATUS_TONE = {
  ok: 'ok',
  error: 'error',
  stale: 'warn',
  running: 'info',
  skipped: 'neutral',
} as const

const STATUS_ORDER = ['error', 'stale', 'running', 'ok', 'skipped'] as const

interface Props {
  projectPath: string
  scenarioId: string
  provenance: StageRun[]
  busy: boolean
  onJob: (jobId: string) => void
  /** itemId → readable label (phase titles, inject row ids). */
  itemLabels?: Record<string, string>
}

const runName = (run: StageRun, labels?: Record<string, string>): string =>
  stageLabel(run.stage) + (run.itemId ? ` · ${itemLabel(run.itemId, labels)}` : '')

function RerunDialog(props: {
  run: StageRun | null
  labels?: Record<string, string>
  onCancel: () => void
  onConfirm: (instructions: string) => void
}) {
  const [instructions, setInstructions] = useState('')
  const run = props.run
  return (
    <Dialog
      open={!!run}
      onOpenChange={(open) => !open && props.onCancel()}
      title={`Re-run ${run ? runName(run, props.labels) : ''}?`}
      description="Later stages that depend on this one are marked stale. Locked rows are kept."
      footer={
        <>
          <Button onClick={props.onCancel}>Cancel</Button>
          <Button variant="primary" onClick={() => props.onConfirm(instructions)}>
            Re-run
          </Button>
        </>
      }
    >
      <Field label="Extra instructions (optional)" hint="Added to the prompt for this run only.">
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Make the red herring more plausible; cite ASP §6.4"
          />
        )}
      </Field>
    </Dialog>
  )
}

function useStageActions(props: Props) {
  const { projectPath, scenarioId, onJob } = props
  const start = async (what: string, fn: () => Promise<{ jobId: string }>) => {
    try {
      onJob((await fn()).jobId)
    } catch (e) {
      toast.error(`Could not ${what}`, e)
    }
  }
  return {
    rerun: (run: StageRun, instructions: string) =>
      start('re-run the stage', () =>
        call('generate:rerun-stage', {
          projectPath,
          scenarioId,
          stage: run.stage,
          ...(run.itemId ? { itemId: run.itemId } : {}),
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        }),
      ),
    resume: () =>
      start('continue generation', () => call('generate:continue', { projectPath, scenarioId })),
  }
}

function RunItem(props: {
  run: StageRun
  labels?: Record<string, string> | undefined
  busy: boolean
  onRerun: (run: StageRun) => void
}) {
  const { run } = props
  return (
    <li className="timeline__item">
      <div className="timeline__name">
        <span>{stageLabel(run.stage)}</span>
        {run.itemId && <span className="muted">{itemLabel(run.itemId, props.labels)}</span>}
      </div>
      <Badge tone={STATUS_TONE[run.status]}>{run.status}</Badge>
      <span className="muted timeline__meta">
        {run.model ?? '—'} · {runTokens(run)}
        {runCost(run) && ` · ${runCost(run)}`} · {runDuration(run)}
      </span>
      {run.error && <span className="field__error timeline__error">{run.error}</span>}
      <Button
        size="sm"
        variant="ghost"
        disabled={props.busy}
        aria-label={`Re-run ${stageLabel(run.stage)}${run.itemId ? ` ${itemLabel(run.itemId, props.labels)}` : ''}`}
        onClick={() => props.onRerun(run)}
      >
        <RotateCcw size={14} aria-hidden /> Re-run
      </Button>
    </li>
  )
}

function CountBadges({ counts }: { counts: StatusCounts }) {
  return (
    <span className="timeline__counts">
      {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
        <Badge key={s} tone={STATUS_TONE[s]}>
          {counts[s]} {s}
        </Badge>
      ))}
    </span>
  )
}

function RunGroup(props: {
  stage: string
  runs: StageRun[]
  counts: StatusCounts
  labels?: Record<string, string> | undefined
  busy: boolean
  onRerun: (run: StageRun) => void
}) {
  const failed = !!props.counts.error
  // Follows the counts until the user toggles: errors keep the group open.
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? failed
  const listId = useId()
  const n = props.runs.length
  return (
    <li className="timeline__group" data-failed={failed || undefined}>
      <button
        type="button"
        className="timeline__group-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setToggled(!open)}
      >
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        <span className="timeline__group-name">{stageLabel(props.stage)}</span>
        <span className="muted">
          {n} inject{n === 1 ? '' : 's'}
        </span>
      </button>
      <CountBadges counts={props.counts} />
      {open && (
        <ol id={listId} className="timeline__list timeline__list--nested">
          {props.runs.map((run) => (
            <RunItem
              key={`${run.stage}:${run.itemId ?? ''}`}
              run={run}
              labels={props.labels}
              busy={props.busy}
              onRerun={props.onRerun}
            />
          ))}
        </ol>
      )}
    </li>
  )
}

/**
 * A stage can continue when it failed or went stale, or when it still says "running" although
 * no job runs (an app exit cut it off, #195).
 */
const canContinue = (runs: StageRun[], busy: boolean): boolean =>
  runs.some(
    (r) => r.status === 'error' || r.status === 'stale' || (!busy && r.status === 'running'),
  )

function TimelineHead(props: Props & { runs: StageRun[]; busy: boolean; resume: () => void }) {
  const cost = totalCost(props.runs)
  return (
    <div className="row timeline__head">
      <h2 className="section-title">Stages</h2>
      {cost && <span className="muted">Reported cost {cost}</span>}
      <span className="row">
        {canContinue(props.runs, props.busy) && (
          <Button size="sm" variant="primary" disabled={props.busy} onClick={props.resume}>
            <Play size={14} aria-hidden /> Continue from failure
          </Button>
        )}
        <RepairScenario
          projectPath={props.projectPath}
          scenarioId={props.scenarioId}
          busy={props.busy}
          onJob={props.onJob}
        />
      </span>
    </div>
  )
}

export function StageTimeline(props: Props) {
  const runs = latestRuns(props.provenance)
  const [pending, setPending] = useState<StageRun | null>(null)
  const actions = useStageActions(props)
  const { job } = useScenarioJob(props.projectPath, props.scenarioId)
  const busy = props.busy || !!job
  const common = { labels: props.itemLabels, busy, onRerun: setPending }
  return (
    <section className="card timeline" aria-label="Generation stages">
      <TimelineHead {...props} runs={runs} busy={busy} resume={() => void actions.resume()} />
      {job?.kind === 'repair-scenario' && <JobBanner job={job} />}
      {runs.length === 0 ? (
        <p className="muted">No stages have run for this scenario.</p>
      ) : (
        <ol className="timeline__list">
          {timelineEntries(runs).map((e) =>
            e.kind === 'run' ? (
              <RunItem key={`${e.run.stage}:${e.run.itemId ?? ''}`} run={e.run} {...common} />
            ) : (
              <RunGroup
                key={`group:${e.stage}`}
                stage={e.stage}
                runs={e.runs}
                counts={e.counts}
                {...common}
              />
            ),
          )}
        </ol>
      )}
      <RerunDialog
        key={pending ? `${pending.stage}:${pending.itemId ?? ''}` : 'none'}
        run={pending}
        {...(props.itemLabels ? { labels: props.itemLabels } : {})}
        onCancel={() => setPending(null)}
        onConfirm={(text) => {
          const run = pending
          setPending(null)
          if (run) void actions.rerun(run, text)
        }}
      />
    </section>
  )
}
