// Playing an unfolding case study (spec 0452 FR-9 to FR-11, NFR-3, NFR-5): a notice about answers
// and content first (with an opt-out), then one stage at a time. Every prompt is a native form
// control reachable by keyboard; feedback is announced in a polite live region; figures come with
// their text summary and data table; time is never limited. A group run records each member's own
// answer before the agreed one. The scale is this app's own and the screen says so.
import { useState } from 'react'
import type { CaseStudyResponse } from '@shared/schemas'
import { CASE_STUDY_PRIVACY_NOTE, CASE_STUDY_SCORE_NOTE } from '@shared/schemas'
import type { PlayView } from '@shared/ipc'
import { Button, Field, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcQuery } from '../../lib/query'

type PlayPrompt = PlayView['stage']['prompts'][number]

function Start(props: {
  projectPath: string
  caseId: string
  preview: boolean
  onStarted: (runId: string) => void
  onClose: () => void
}) {
  const info = useIpcQuery('casestudy:get', { projectPath: props.projectPath, id: props.caseId })
  const [mode, setMode] = useState<'individual' | 'group'>('individual')
  const [learner, setLearner] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const study = info.data
  const start = async () => {
    setBusy(true)
    try {
      const r = await call('casestudy:run-start', {
        projectPath: props.projectPath,
        caseId: props.caseId,
        mode,
        acknowledged: ack,
        ...(learner.trim() ? { learner: learner.trim() } : {}),
        ...(props.preview ? { preview: true } : {}),
      })
      props.onStarted(r.runId)
    } catch (e) {
      toast.error('Could not start', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="page cs-page">
      <PageHeader
        eyebrow="Case study"
        title={study?.title ?? 'Case study'}
        description={study?.patient.summary ?? ''}
      />
      <section className="card stack" aria-labelledby="cs-before-title">
        <h2 id="cs-before-title" className="section-title">
          Before you start
        </h2>
        {study && study.objectives.length > 0 && (
          <>
            <p>In this case you will practice to:</p>
            <ul>
              {study.objectives.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          </>
        )}
        <p className="cs-note" role="note">
          This is exercise content with a simulated patient. It is practice, not clinical guidance.
        </p>
        <p className="cs-note" role="note">
          {CASE_STUDY_SCORE_NOTE}
        </p>
        <p className="cs-note" role="note">
          {CASE_STUDY_PRIVACY_NOTE}
        </p>
        {study?.contentNotice && (
          <p className="cs-note cs-note--warn" role="note">
            <strong>Content notice.</strong> {study.contentNotice} You can choose not to do this
            case.
          </p>
        )}
        <fieldset className="cs-fieldset">
          <legend>How you are taking the case</legend>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === 'individual'}
              onChange={() => setMode('individual')}
            />{' '}
            On my own
          </label>
          <label>
            <input
              type="radio"
              name="mode"
              checked={mode === 'group'}
              onChange={() => setMode('group')}
            />{' '}
            As a small group, one answer for the group
          </label>
        </fieldset>
        <Field label="Your name or label (optional)">
          {({ id }) => (
            <input
              id={id}
              className="input"
              maxLength={80}
              value={learner}
              onChange={(e) => setLearner(e.target.value)}
            />
          )}
        </Field>
        <label>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have
          read these notices
        </label>
        <div className="row">
          <Button variant="primary" disabled={!ack || busy} onClick={() => void start()}>
            Start the case
          </Button>
          <Button onClick={props.onClose}>Choose not to do this case</Button>
        </div>
      </section>
    </div>
  )
}

function PromptForm(props: {
  prompt: PlayPrompt
  group: boolean
  disabled: boolean
  onSubmit: (
    response: CaseStudyResponse,
    preVotes?: { member: string; response: CaseStudyResponse }[],
  ) => void
}) {
  const { prompt } = props
  const options = prompt.options ?? []
  const [picked, setPicked] = useState<string[]>([])
  const [text, setText] = useState('')
  const [order, setOrder] = useState<string[]>(options.map((o) => o.id))
  const [members, setMembers] = useState<{ member: string; response: string[] }[]>([])
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const move = (i: number, d: -1 | 1) =>
    setOrder((o) => {
      const next = [...o]
      const j = i + d
      if (j < 0 || j >= next.length) return o
      ;[next[i], next[j]] = [next[j]!, next[i]!]
      return next
    })
  const label = (id: string) => options.find((o) => o.id === id)?.text ?? id
  const response: CaseStudyResponse =
    prompt.type === 'rationale' ? text : prompt.type === 'rank_hypotheses' ? order : picked
  const ready =
    prompt.type === 'rationale'
      ? text.trim().length > 0
      : prompt.type === 'rank_hypotheses'
        ? true
        : picked.length > 0
  const isSingle = prompt.type === 'evaluate_outcome'
  return (
    <fieldset className="cs-prompt" disabled={props.disabled}>
      <legend>
        <span className="cs-step">{prompt.stepLabel}</span> {prompt.text}
      </legend>
      {prompt.type === 'rationale' && (
        <Field label="Your answer">
          {({ id }) => (
            <textarea
              id={id}
              className="input"
              rows={3}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </Field>
      )}
      {(prompt.type === 'select_cues' || prompt.type === 'choose_actions' || isSingle) &&
        options.map((o) => (
          <label key={o.id} className="cs-option">
            <input
              type={isSingle ? 'radio' : 'checkbox'}
              name={prompt.id}
              checked={picked.includes(o.id)}
              onChange={() => (isSingle ? setPicked([o.id]) : toggle(o.id))}
            />{' '}
            {o.text}
          </label>
        ))}
      {prompt.type === 'rank_hypotheses' && (
        <>
          <p className="muted">Most likely first. Use the buttons to move an item up or down.</p>
          <ol className="cs-rank">
            {order.map((id, i) => (
              <li key={id}>
                {label(id)}{' '}
                <Button
                  size="sm"
                  aria-label={`Move up: ${label(id)}`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  Up
                </Button>{' '}
                <Button
                  size="sm"
                  aria-label={`Move down: ${label(id)}`}
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                >
                  Down
                </Button>
              </li>
            ))}
          </ol>
        </>
      )}
      {props.group && prompt.type !== 'rationale' && prompt.type !== 'rank_hypotheses' && (
        <details className="cs-votes">
          <summary>Record each member’s own answer first (optional)</summary>
          {members.map((m, i) => (
            <div key={i} className="cs-member">
              <strong>{m.member}</strong>:{' '}
              {options.map((o) => (
                <label key={o.id} className="cs-option">
                  <input
                    type="checkbox"
                    checked={m.response.includes(o.id)}
                    onChange={(e) =>
                      setMembers((all) =>
                        all.map((x, k) =>
                          k === i
                            ? {
                                ...x,
                                response: e.target.checked
                                  ? [...x.response, o.id]
                                  : x.response.filter((r) => r !== o.id),
                              }
                            : x,
                        ),
                      )
                    }
                  />{' '}
                  {o.text}
                </label>
              ))}
            </div>
          ))}
          <Button
            size="sm"
            disabled={members.length >= 8}
            onClick={() =>
              setMembers((m) => [...m, { member: `Member ${m.length + 1}`, response: [] }])
            }
          >
            Add a member
          </Button>
        </details>
      )}
      <Button
        variant="primary"
        disabled={!ready}
        onClick={() => props.onSubmit(response, members.length ? members : undefined)}
      >
        Submit answer
      </Button>
    </fieldset>
  )
}

function Figures({ view }: { view: PlayView }) {
  return (
    <>
      {view.stage.figures.map((f) => (
        <figure key={f.name} className="cs-figure">
          <img alt={f.summary} src={`data:image/svg+xml;utf8,${encodeURIComponent(f.svg)}`} />
          {f.table && (
            <details>
              <summary>Data table</summary>
              <DataTable caption={f.table.caption} columns={f.table.columns} rows={f.table.rows} />
            </details>
          )}
        </figure>
      ))}
    </>
  )
}

function DataTable(props: { caption?: string; columns: string[]; rows: string[][] }) {
  return (
    <table className="table">
      {props.caption && <caption>{props.caption}</caption>}
      <thead>
        <tr>
          {props.columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r, i) => (
          <tr key={i}>
            {r.map((cell, k) =>
              k === 0 ? (
                <th key={k} scope="row">
                  {cell}
                </th>
              ) : (
                <td key={k}>{cell}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Report({ view, onClose }: { view: PlayView; onClose: () => void }) {
  return (
    <section className="card stack" aria-labelledby="cs-report-title">
      <h2 id="cs-report-title" className="section-title">
        Your profile across the six steps
      </h2>
      <p>
        Overall: <strong>{view.overall === null ? 'n/a' : `${view.overall}%`}</strong> of the
        possible credit on this app’s practice scale. {view.notes.score}
      </p>
      <table className="table">
        <caption className="sr-only">Score by step of clinical judgment</caption>
        <thead>
          <tr>
            <th scope="col">Step</th>
            <th scope="col">Questions</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {view.profile.map((p) => (
            <tr key={p.step}>
              <th scope="row">{p.label}</th>
              <td>{p.prompts}</td>
              <td>{p.percent === null ? 'n/a' : `${p.percent}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        A low score on a step is a prompt to review that kind of thinking, not a judgment of you.
        Ask your facilitator about the debrief.
      </p>
      <div>
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    </section>
  )
}

export function PlayerView(props: {
  projectPath: string
  caseId: string
  runId?: string
  preview?: boolean
  onStarted: (runId: string) => void
  onClose: () => void
}) {
  if (!props.runId)
    return (
      <Start
        projectPath={props.projectPath}
        caseId={props.caseId}
        preview={!!props.preview}
        onStarted={props.onStarted}
        onClose={props.onClose}
      />
    )
  return <Stage projectPath={props.projectPath} runId={props.runId} onClose={props.onClose} />
}

function Stage(props: { projectPath: string; runId: string; onClose: () => void }) {
  const query = useIpcQuery('casestudy:play', {
    projectPath: props.projectPath,
    runId: props.runId,
  })
  const [override, setOverride] = useState<PlayView | undefined>()
  const [busy, setBusy] = useState(false)
  const view = override ?? query.data
  if (!view) return <p className="muted">Loading the case…</p>
  const answered = new Set(view.feedback.map((f) => f.promptId))
  const act = async (fn: () => Promise<PlayView>) => {
    setBusy(true)
    try {
      setOverride(await fn())
    } catch (e) {
      toast.error('Could not continue', errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const submit = (
    promptId: string,
    response: CaseStudyResponse,
    preVotes?: { member: string; response: CaseStudyResponse }[],
  ) =>
    act(() =>
      call('casestudy:run-answer', {
        projectPath: props.projectPath,
        runId: props.runId,
        promptId,
        response,
        ...(preVotes ? { preVotes } : {}),
      }),
    )
  if (view.finished)
    return (
      <div className="page cs-page">
        <PageHeader
          eyebrow="Case study"
          title={view.study.title}
          description="You reached the end of the case."
        />
        <Report view={view} onClose={props.onClose} />
      </div>
    )
  return (
    <div className="page cs-page">
      <PageHeader
        eyebrow={`Stage ${view.stageNumber}${view.stage.time ? ` · ${view.stage.time}` : ''}`}
        title={view.stage.title}
        description={view.study.title}
      />
      <section className="card stack" aria-label="What is new">
        <p>{view.stage.narrative}</p>
        {view.stage.statements.map((s, i) => (
          <blockquote key={i} className="cs-quote">
            <strong>{s.speaker}:</strong> {s.text}
          </blockquote>
        ))}
        {view.stage.tables.map((t) => (
          <DataTable key={t.caption} caption={t.caption} columns={t.columns} rows={t.rows} />
        ))}
        <Figures view={view} />
      </section>
      <section className="stack" aria-label="Questions">
        {view.stage.prompts.map((p) => {
          const fb = view.feedback.find((f) => f.promptId === p.id)
          return (
            <div key={`${view.stage.id}-${p.id}`} className="card stack">
              <PromptForm
                prompt={p}
                group={view.run.mode === 'group'}
                disabled={answered.has(p.id) || busy}
                onSubmit={(r, v) => void submit(p.id, r, v)}
              />
              <div role="status" aria-live="polite">
                {fb && (
                  <div className="cs-feedback">
                    <p>
                      <strong>Score for this question: {Math.round(fb.score * 100)}%.</strong>
                    </p>
                    <p>{fb.rationale}</p>
                    <p className="muted">The strongest answer: {fb.bestAnswer}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </section>
      <div className="row">
        <Button
          variant="primary"
          disabled={!view.canAdvance || busy}
          onClick={() =>
            void act(() =>
              call('casestudy:run-advance', { projectPath: props.projectPath, runId: props.runId }),
            )
          }
        >
          Continue to the next stage
        </Button>
        <Button onClick={props.onClose}>Leave the case</Button>
      </div>
      <p className="muted">{view.notes.privacy}</p>
    </div>
  )
}
