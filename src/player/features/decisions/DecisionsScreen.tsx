import { useRef, useState, type FormEvent } from 'react'
import type { DecisionField, DecisionForm } from '../../../shared/schemas/decisions'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { AreaInput, ChoiceInput, NumberInput, TextInput, TimeInput } from './DecisionFields'
import { draftProblems, EMPTY_DRAFT, formsForMe, type Draft } from './decisions'

const T = STRINGS.decisions

type Problems = Record<string, string>

interface FieldProps {
  field: DecisionField
  draft: Draft
  problems: Problems
  onValue: (id: string, value: string) => void
  onArea: (areaId: string) => void
}

function Field({ field, draft, problems, onValue, onArea }: FieldProps) {
  const problem = problems[field.id]
  const value = draft.values[field.id] ?? ''
  const change = (v: string) => onValue(field.id, v)
  switch (field.type) {
    case 'text':
      return <TextInput field={field} value={value} problem={problem} onChange={change} />
    case 'number':
      return <NumberInput field={field} value={value} problem={problem} onChange={change} />
    case 'time':
      return <TimeInput field={field} value={value} problem={problem} onChange={change} />
    case 'choice':
      return <ChoiceInput field={field} value={value} problem={problem} onChange={change} />
    case 'area':
      return (
        <AreaInput field={field} value={draft.areaId ?? ''} problem={problem} onChange={onArea} />
      )
  }
}

/**
 * One form: every field labelled, required ones checked on send and named in an alert, the
 * first one with a problem taking focus. Sending queues the decision when offline.
 */
function FormView({
  session,
  form,
  onSent,
}: {
  session: PlayerSession
  form: DecisionForm
  onSent: (title: string, sent: boolean) => void
}) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [problems, setProblems] = useState<Problems>({})
  const element = useRef<HTMLFormElement>(null)
  const attribution = useStore(session.store, (s) => s.info?.attribution)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const found = draftProblems(form, draft)
    setProblems(found)
    const first = form.fields.find((f) => found[f.id])
    if (first) {
      element.current
        ?.querySelector<HTMLElement>(`[id="dec-${first.id}"], [name="dec-${first.id}"]`)
        ?.focus()
      return
    }
    void session.submitDecision(form.id, draft).then((id) => {
      if (!id) return
      const sent = !session.store.get().decisions.some((d) => d.decisionId === id && !d.sent)
      onSent(form.title, sent)
    })
  }

  const count = Object.keys(problems).length
  return (
    <form ref={element} className="vote-form survey-form" onSubmit={submit} noValidate>
      {form.description ? <p>{form.description}</p> : null}
      {count ? (
        <p role="alert" className="survey-q__error">
          {T.problems(count)}
        </p>
      ) : null}
      {form.fields.map((f) => (
        <Field
          key={f.id}
          field={f}
          draft={draft}
          problems={problems}
          onValue={(id, v) => {
            setDraft((d) => ({ ...d, values: { ...d.values, [id]: v } }))
            setProblems(({ [id]: _gone, ...rest }) => rest)
          }}
          onArea={(areaId) => {
            setDraft((d) => ({ ...d, areaId: areaId || undefined }))
            setProblems(({ [f.id]: _gone, ...rest }) => rest)
          }}
        />
      ))}
      <button type="submit" className="btn btn--primary btn--block">
        {T.send}
      </button>
      <p className="muted">{attribution === 'named' ? T.recordedNamed : T.recorded}</p>
    </form>
  )
}

function FormList({ forms, onPick }: { forms: DecisionForm[]; onPick: (formId: string) => void }) {
  if (!forms.length) {
    return (
      <>
        <p>{T.none}</p>
        <p className="muted">{T.noneHint}</p>
      </>
    )
  }
  return (
    <ul className="menu" aria-label={T.pick}>
      {forms.map((f) => (
        <li key={f.id} className="menu__item">
          <button type="button" className="menu__btn" onClick={() => onPick(f.id)}>
            <span className="menu__label">{f.title}</span>
            <span className="menu__chevron" aria-hidden="true">
              ›
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function SentList({ session }: { session: PlayerSession }) {
  const decisions = useStore(session.store, (s) => s.decisions)
  if (!decisions.length) return null
  return (
    <section aria-labelledby="decisions-sent">
      <h2 id="decisions-sent" className="h3">
        {T.sentHeading}
      </h2>
      <ul className="menu">
        {decisions.map((d) => (
          <li key={d.decisionId} className="menu__item">
            <span className="menu__btn">
              <span className="menu__label">{d.title}</span>
              <span className="menu__why">{d.sent ? T.sent : T.waiting}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Decisions under More (spec 0448 FR-14): the forms the exercise gives this seat, one at a time,
 * and what this device has sent. Forms for other seats never show.
 */
export function DecisionsScreen({
  session,
  onBack,
}: {
  session: PlayerSession
  onBack: () => void
}) {
  const forms = useStore(session.store, (s) => s.decisionForms)
  const seat = useStore(session.store, (s) => s.seat)
  const mine = formsForMe(forms, seat?.role?.id)
  const [picked, setPicked] = useState<string | undefined>()
  const [note, setNote] = useState<string | undefined>()
  const current = mine.find((f) => f.id === picked)

  return (
    <section className="screen" aria-labelledby="decisions-heading" data-screen="decisions">
      <button
        type="button"
        className="btn btn--quiet back"
        onClick={current ? () => setPicked(undefined) : onBack}
      >
        <span aria-hidden="true">‹ </span>
        {current ? T.backToList : T.back}
      </button>
      <div className="screen__head">
        <h1 id="decisions-heading">{current ? current.title : T.heading}</h1>
      </div>
      <p role="status" className="vote-status">
        {note}
      </p>
      {current ? (
        <FormView
          key={current.id}
          session={session}
          form={current}
          onSent={(title, sent) => {
            setNote(sent ? T.sentNote(title) : T.queuedNote(title))
            setPicked(undefined)
          }}
        />
      ) : (
        <>
          <FormList
            forms={mine}
            onPick={(id) => {
              setNote(undefined)
              setPicked(id)
            }}
          />
          <SentList session={session} />
        </>
      )}
    </section>
  )
}
