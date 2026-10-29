// Running a micro-drill on this computer (#437, FR-8 to FR-16, FR-22): the situation, then one
// question at a time. One person types (a team chooses who is answering). After each answer the
// facilitator says which expected points were covered; hints are offered, never forced, and are
// the drill's own prewritten text. The clock counts up and never stops the drill.
import { useState } from 'react'
import type { HintLevel, MicroDrill, MicroDrillRun } from '@shared/schemas'
import { MICRO_DRILL_NOTICE } from '@shared/schemas'
import { Button, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'
import { ruleText } from './rule-text'
import { clockText, useClock } from './use-clock'

type Person = { label: string; name?: string }

function PeopleForm(props: {
  drill: MicroDrill
  onStart: (people: Person[]) => void
  busy: boolean
}) {
  const team = props.drill.mode === 'team'
  const [people, setPeople] = useState<Person[]>(
    team ? [{ label: 'Participant 1' }, { label: 'Participant 2' }] : [{ label: 'Participant 1' }],
  )
  const set = (i: number, patch: Partial<Person>) =>
    setPeople((p) => p.map((x, k) => (k === i ? { ...x, ...patch } : x)))
  return (
    <section className="card stack" aria-labelledby="micro-people-title">
      <h2 id="micro-people-title" className="section-title">
        {team ? 'Who is taking part' : 'Before you start'}
      </h2>
      <p className="muted">
        Names are optional and stay in this project. Leave a name empty to stay anonymous; the
        results are kept under the label.
      </p>
      {people.map((p, i) => (
        <div key={i} className="micro-person">
          <Field label={`Label for person ${i + 1}`}>
            {({ id }) => (
              <input
                id={id}
                className="input"
                maxLength={40}
                value={p.label}
                onChange={(e) => set(i, { label: e.target.value })}
              />
            )}
          </Field>
          <Field label={`Name for person ${i + 1} (optional)`}>
            {({ id }) => (
              <input
                id={id}
                className="input"
                maxLength={80}
                value={p.name ?? ''}
                onChange={(e) => set(i, { name: e.target.value })}
              />
            )}
          </Field>
        </div>
      ))}
      {team && (
        <div className="row">
          <Button
            disabled={people.length >= 6}
            onClick={() => setPeople((p) => [...p, { label: `Participant ${p.length + 1}` }])}
          >
            Add a person
          </Button>
          <Button disabled={people.length <= 2} onClick={() => setPeople((p) => p.slice(0, -1))}>
            Remove the last person
          </Button>
        </div>
      )}
      <div>
        <Button variant="primary" disabled={props.busy} onClick={() => props.onStart(people)}>
          Start the drill
        </Button>
      </div>
    </section>
  )
}

function Clock(props: { run: MicroDrillRun; planned: number; clock: ReturnType<typeof useClock> }) {
  const over = props.clock.elapsedSec > props.planned * 60
  return (
    <div className="micro-clock row">
      <span>
        <span className="sr-only">Time used: </span>
        <time>{clockText(props.clock.elapsedSec)}</time> of {props.planned}:00 planned
        {props.clock.paused ? ' (paused)' : ''}
      </span>
      <Button size="sm" onClick={props.clock.toggle}>
        {props.clock.paused ? 'Resume the clock' : 'Pause the clock'}
      </Button>
      {over && <span className="muted">Over the planned time. Nothing stops; carry on.</span>}
    </div>
  )
}

function UsedHints({ step, used }: { step: MicroDrill['steps'][number]; used: HintLevel[] }) {
  if (!used.length) return null
  return (
    <ul className="micro-hints" aria-label="Hints used on this question">
      {used.map((level) => {
        const h = step.hints[level - 1]!
        return (
          <li key={level}>
            <strong>Hint {level}.</strong> {h.text}
            {'citation' in h && (
              <span className="muted">
                {' '}
                Plan: {h.citation.headingPath}
                {h.citation.page ? `, page ${h.citation.page}` : ''}.
              </span>
            )}
            {h.level === 3 && <blockquote>{h.quote}</blockquote>}
          </li>
        )
      })}
    </ul>
  )
}

function Feedback(props: {
  drill: MicroDrill
  run: MicroDrillRun
  stepId: string
  offer: HintLevel | null
}) {
  const step = props.drill.steps.find((s) => s.id === props.stepId)!
  const attempt = props.run.steps.find((s) => s.stepId === props.stepId)?.attempts.at(-1)
  if (!attempt) return <div role="status" aria-live="polite" />
  const text = (ids: string[]) =>
    step.expectedPoints.filter((p) => ids.includes(p.id)).map((p) => p.text)
  const left = attempt.missing.length + attempt.partial.length
  return (
    <div role="status" aria-live="polite" className="micro-feedback">
      {attempt.covered.length > 0 && (
        <>
          <p>Covered:</p>
          <ul>
            {text(attempt.covered).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
      {left === 0 ? (
        <p>You covered every point for this question.</p>
      ) : (
        <p>
          {left} {left === 1 ? 'point is' : 'points are'} not fully covered yet.
          {attempt.followUp ? ` ${attempt.followUp}` : ''}
        </p>
      )}
      {props.offer && <p>A hint is available if you want one (Level {props.offer}).</p>}
    </div>
  )
}

function Checklist(props: {
  step: MicroDrill['steps'][number]
  onConfirm: (ids: string[]) => void
  busy: boolean
}) {
  const [ticked, setTicked] = useState<string[]>([])
  return (
    <fieldset className="micro-checklist">
      <legend>Tick the points your answer covered</legend>
      {props.step.expectedPoints.map((p) => (
        <label key={p.id} className="micro-check">
          <input
            type="checkbox"
            checked={ticked.includes(p.id)}
            onChange={(e) =>
              setTicked((t) => (e.target.checked ? [...t, p.id] : t.filter((x) => x !== p.id)))
            }
          />{' '}
          {p.text}
        </label>
      ))}
      <p>
        <strong>Model answer.</strong> {props.step.modelAnswer}
      </p>
      <Button variant="primary" disabled={props.busy} onClick={() => props.onConfirm(ticked)}>
        Confirm the ticked points
      </Button>
    </fieldset>
  )
}

function Question(props: {
  projectPath: string
  drill: MicroDrill
  run: MicroDrillRun
  index: number
  setRun: (r: MicroDrillRun) => void
  onNext: () => void
}) {
  const { drill, run, index } = props
  const step = drill.steps[index]!
  const runStep = run.steps.find((s) => s.stepId === step.id)!
  const [text, setText] = useState('')
  const [who, setWho] = useState(run.participants[0]!.label)
  const [offer, setOffer] = useState<HintLevel | null>(null)
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const checklist = run.assessment === 'checklist'
  const base = { projectPath: props.projectPath, runId: run.id, stepId: step.id }
  const attempt = async (ticked?: string[]) => {
    setBusy(true)
    try {
      const r = await call('microdrills:answer', {
        ...base,
        participantLabel: who,
        text,
        ...(ticked ? { ticked } : {}),
      })
      props.setRun(r.run)
      setOffer(r.hintOffer)
      setReveal(false)
      setText('')
    } catch (e) {
      toast.error('Could not check the answer', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const hint = async () => {
    try {
      const r = await call('microdrills:hint', base)
      props.setRun(r.run)
      setOffer(null)
    } catch (e) {
      toast.error('No hint', errorText(e))
    }
  }
  const nextLevel = runStep.hintsUsed.length ? Math.max(...runStep.hintsUsed) + 1 : 1
  const last = index === drill.steps.length - 1
  return (
    <section className="card stack" aria-labelledby="micro-q">
      <h2 id="micro-q" className="section-title">
        Question {index + 1} of {drill.steps.length}
      </h2>
      <p className="micro-prompt">{step.prompt}</p>
      {run.participants.length > 1 && (
        <Field label="Who is answering">
          {({ id }) => (
            <select id={id} className="select" value={who} onChange={(e) => setWho(e.target.value)}>
              {run.participants.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <Field
        label="Your answer"
        hint="Write it as you would say it to a colleague. There is no time limit."
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            className="textarea"
            aria-describedby={describedBy}
            rows={5}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
      <UsedHints step={step} used={runStep.hintsUsed} />
      <Feedback drill={drill} run={run} stepId={step.id} offer={offer} />
      {checklist && reveal ? (
        <Checklist step={step} busy={busy} onConfirm={(ids) => void attempt(ids)} />
      ) : (
        <div className="row">
          <Button
            variant="primary"
            disabled={busy || !text.trim()}
            onClick={() => (checklist ? setReveal(true) : void attempt())}
          >
            {checklist ? 'I have answered' : 'Check my answer'}
          </Button>
          <Button disabled={runStep.hintsUsed.length >= 3} onClick={() => void hint()}>
            {nextLevel > 3 ? 'No more hints' : `Show a hint (Level ${nextLevel})`}
          </Button>
          <Button disabled={!runStep.attempts.length} onClick={props.onNext}>
            {last ? 'Finish the drill' : 'Next question'}
          </Button>
        </div>
      )}
    </section>
  )
}

function Running(props: {
  projectPath: string
  drill: MicroDrill
  run: MicroDrillRun
  setRun: (r: MicroDrillRun) => void
  onFinished: (id: string) => void
}) {
  const { drill, run } = props
  const [index, setIndex] = useState(0)
  const clock = useClock(run.startedAt)
  const next = async () => {
    if (index < drill.steps.length - 1) return setIndex(index + 1)
    try {
      const done = await call('microdrills:run-finish', {
        projectPath: props.projectPath,
        runId: run.id,
        pausedSec: clock.pausedSec(),
      })
      props.onFinished(done.id)
    } catch (e) {
      toast.error('Could not finish', errorText(e))
    }
  }
  return (
    <>
      <p className="micro-note" role="note">
        {MICRO_DRILL_NOTICE}
      </p>
      <p className="micro-rule">{ruleText(run)}</p>
      {run.checklistReason && <p className="micro-rule">{run.checklistReason}</p>}
      <Clock run={run} planned={drill.durationMin} clock={clock} />
      {index === 0 && (
        <section className="card" aria-labelledby="micro-sit">
          <h2 id="micro-sit" className="section-title">
            The situation
          </h2>
          <p>{drill.situation}</p>
        </section>
      )}
      <Question
        key={index}
        projectPath={props.projectPath}
        drill={drill}
        run={run}
        index={index}
        setRun={props.setRun}
        onNext={() => void next()}
      />
    </>
  )
}

export function RunView(props: {
  projectPath: string
  drillId: string
  onFinished: (runId: string) => void
  onClose: () => void
}) {
  const drill = useIpcQuery('microdrills:get', {
    projectPath: props.projectPath,
    id: props.drillId,
  })
  const [run, setRun] = useState<MicroDrillRun | null>(null)
  const [busy, setBusy] = useState(false)
  const start = async (participants: Person[]) => {
    setBusy(true)
    try {
      setRun(
        await call('microdrills:run-start', {
          projectPath: props.projectPath,
          drillId: props.drillId,
          participants,
        }),
      )
    } catch (e) {
      toast.error('Could not start the drill', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  if (drill.isPending) return <p className="muted page">Loading the drill…</p>
  if (!drill.data) return <p className="page">That drill could not be opened.</p>
  return (
    <div className="page micro-page">
      <PageHeader
        eyebrow="Micro-drill"
        title={drill.data.title}
        description={`${drill.data.annex.documentTitle} › ${drill.data.annex.headingPath}`}
        actions={<Button onClick={props.onClose}>Leave the drill</Button>}
      />
      {run ? (
        <Running
          projectPath={props.projectPath}
          drill={drill.data}
          run={run}
          setRun={setRun}
          onFinished={props.onFinished}
        />
      ) : (
        <>
          <p className="micro-note" role="note">
            {MICRO_DRILL_NOTICE}
          </p>
          <PeopleForm drill={drill.data} busy={busy} onStart={(p) => void start(p)} />
        </>
      )}
    </div>
  )
}
