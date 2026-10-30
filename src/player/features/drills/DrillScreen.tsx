import { useState } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { allChecked, firstOpenStep, stepState, type PlayerDrill, type StepState } from './drills'
import './drills.css'

const T = STRINGS.drills

function Hints({ state }: { state: StepState }) {
  if (!state.hints.length) return null
  return (
    <ul className="drill-hints" aria-label={T.hintHeading(state.hints.length)}>
      {state.hints.map((h) => (
        <li key={h.level}>
          <strong>{T.hintHeading(h.level)}.</strong> {h.text}
          {h.where ? <span className="muted"> {T.planAt(h.where)}</span> : null}
          {h.quote ? <blockquote>{h.quote}</blockquote> : null}
        </li>
      ))}
    </ul>
  )
}

/** What the facilitator's app said about the latest answer; a polite live region. */
function Reply({ state }: { state: StepState }) {
  const r = state.reply
  return (
    <div role="status" aria-live="polite" className="drill-reply">
      {state.pending ? <p className="muted">{T.waiting}</p> : null}
      {r?.kind === 'error' ? <p className="survey-q__error">{r.message}</p> : null}
      {r?.kind === 'result' ? (
        <>
          {r.covered?.length ? (
            <>
              <p>{T.covered}</p>
              <ul>
                {r.covered.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p>
            {(r.left ?? 0) === 0 ? T.allCovered : T.left(r.left ?? 0)}
            {r.followUp ? ` ${r.followUp}` : ''}
          </p>
          {r.hintOffer ? <p>{T.hintOffer(r.hintOffer)}</p> : null}
        </>
      ) : null}
    </div>
  )
}

function Checklist({
  state,
  onConfirm,
  busy,
}: {
  state: StepState
  onConfirm: (ids: string[]) => void
  busy: boolean
}) {
  const [ticked, setTicked] = useState<string[]>([])
  const points = state.reply?.points ?? []
  return (
    <fieldset className="drill-checklist">
      <legend>{T.tickLegend}</legend>
      {points.map((p) => (
        <label key={p.id} className="vote-option">
          <input
            type="checkbox"
            checked={ticked.includes(p.id)}
            onChange={(e) =>
              setTicked((t) => (e.target.checked ? [...t, p.id] : t.filter((x) => x !== p.id)))
            }
          />
          <span>{p.text}</span>
        </label>
      ))}
      {state.reply?.modelAnswer ? (
        <p>
          <strong>{T.modelAnswer}.</strong> {state.reply.modelAnswer}
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn--primary btn--block"
        disabled={busy}
        onClick={() => onConfirm(ticked)}
      >
        {T.confirmTicks}
      </button>
    </fieldset>
  )
}

function Question({
  session,
  drill,
  index,
  onNext,
}: {
  session: PlayerSession
  drill: PlayerDrill
  index: number
  onNext: () => void
}) {
  const step = drill.steps[index]!
  const state = stepState(drill, step.id)
  const [text, setText] = useState('')
  const last = index === drill.steps.length - 1
  const open = drill.status === 'open'
  const awaitingTicks = state.reply?.kind === 'checklist' && !state.pending
  const send = (ask: 'check' | 'hint', ticked?: string[]) =>
    session.sendDrillAnswer(drill.drillId, step.id, ask, text, ticked)
  return (
    <section className="drill-q" aria-labelledby={`drill-q-${step.id}`}>
      <h2 id={`drill-q-${step.id}`} className="section-title">
        {T.question(index + 1, drill.steps.length)}
      </h2>
      <p className="drill-prompt">{step.prompt}</p>
      <div className="field">
        <label className="field__label" htmlFor={`drill-a-${step.id}`}>
          {T.answerLabel}
        </label>
        <p className="field__hint" id={`drill-h-${step.id}`}>
          {T.answerHint}
        </p>
        <textarea
          id={`drill-a-${step.id}`}
          className="field__input"
          rows={5}
          maxLength={4000}
          disabled={!open}
          aria-describedby={`drill-h-${step.id}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <Hints state={state} />
      <Reply state={state} />
      {awaitingTicks ? (
        <Checklist
          state={state}
          busy={state.pending}
          onConfirm={(ids) => void send('check', ids)}
        />
      ) : (
        <div className="drill-actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={!open || state.pending || !text.trim()}
            onClick={() => void send('check')}
          >
            {drill.assessment === 'checklist' ? T.checkChecklist : T.check}
          </button>
          <button
            type="button"
            className="btn btn--block"
            disabled={!open || state.pending || state.hints.length >= 3}
            onClick={() => void send('hint')}
          >
            {T.hint}
          </button>
          <button
            type="button"
            className="btn btn--block"
            disabled={!state.checked || last}
            onClick={onNext}
          >
            {T.next}
          </button>
        </div>
      )}
    </section>
  )
}

/**
 * A micro-drill on this device (spec 0437 FR-17): the situation, then one question at a time.
 * Answers go to the facilitator's app, which checks them against the plan and replies to this
 * device only. Hints are the drill's own prewritten text.
 */
export function DrillScreen({
  session,
  drillId,
  onBack,
}: {
  session: PlayerSession
  drillId: string
  onBack: () => void
}) {
  const drill = useStore(session.store, (s) => s.drills[drillId])
  // Opens on the first unanswered question; later moves are the person's own (Next question).
  const [index, setIndex] = useState<number>(() => (drill ? firstOpenStep(drill) : 0))
  if (!drill) return null
  const at = index
  return (
    <section className="screen" aria-labelledby="drill-heading" data-screen="drill">
      <button type="button" className="btn btn--quiet back" onClick={onBack}>
        <span aria-hidden="true">‹ </span>
        {T.back}
      </button>
      <div className="screen__head">
        <h1 id="drill-heading">{drill.title}</h1>
      </div>
      <p className="muted">{T.practiceNote}</p>
      {drill.status === 'closed' ? <p role="status">{T.closed}</p> : null}
      {drill.assessment === 'checklist' ? <p className="muted">{T.checklistNote}</p> : null}
      <section aria-labelledby="drill-situation">
        <h2 id="drill-situation" className="section-title">
          {T.situation}
        </h2>
        <p>{drill.situation}</p>
      </section>
      <Question
        key={drill.steps[at]!.id}
        session={session}
        drill={drill}
        index={at}
        onNext={() => setIndex(at + 1)}
      />
      {allChecked(drill) && drill.status === 'open' ? <p role="status">{T.finished}</p> : null}
      <p className="muted">{T.privacy}</p>
    </section>
  )
}
