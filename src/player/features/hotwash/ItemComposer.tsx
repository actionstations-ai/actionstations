import { useId, useMemo, useState, type FormEvent } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { MAX_CHARS, SUGGESTED_CHARS, type HotwashKind } from './hotwash'

type Choice = 'strength' | 'improvement' | 'answer'
const T = STRINGS.hotwash

/** Add one item: what it is, the text, an optional inject, and whether to leave the role off. */
export function ItemComposer({ session }: { session: PlayerSession }) {
  const ids = useId()
  const info = useStore(session.store, (s) => s.info)
  const seat = useStore(session.store, (s) => s.seat)
  const items = useStore(session.store, (s) => s.items)
  const connection = useStore(session.store, (s) => s.connection)
  const questions = info?.hotwash?.questions ?? []
  const [choice, setChoice] = useState<Choice>('strength')
  const [questionId, setQuestionId] = useState(questions[0]?.id ?? '')
  const [text, setText] = useState('')
  const [rowId, setRowId] = useState('')
  const [anonymous, setAnonymous] = useState(false)
  const [note, setNote] = useState<string>()
  const injects = useMemo(() => {
    const seen = new Map<string, string>()
    for (const i of items)
      if (i.inject?.rowId && !i.withdrawn && !seen.has(i.inject.rowId))
        seen.set(i.inject.rowId, i.title)
    return [...seen]
  }, [items])
  const named = info?.attribution === 'named'
  const roleName = seat?.role?.name ?? (seat?.kind === 'evaluator' ? 'Evaluator' : 'your seat')
  const choices: { id: Choice; label: string }[] = [
    { id: 'strength', label: T.strength },
    { id: 'improvement', label: T.improvement },
    ...(questions.length ? [{ id: 'answer' as const, label: T.answer }] : []),
  ]

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    const kind: HotwashKind = choice === 'answer' ? 'other' : choice
    await session.postHotwash({
      kind,
      text,
      anonymous,
      ...(choice === 'answer' && questionId ? { questionId } : {}),
      ...(rowId ? { mselRowId: rowId } : {}),
    })
    setText('')
    setNote(connection === 'connected' ? T.posted : T.queued)
  }

  return (
    <form className="hw-compose" onSubmit={(e) => void submit(e)} aria-label={T.addHeading}>
      <h2>{T.addHeading}</h2>
      <fieldset className="choice">
        <legend>{T.kindLegend}</legend>
        {choices.map((c) => (
          <label key={c.id} className="choice__option">
            <input
              type="radio"
              name={`${ids}-kind`}
              value={c.id}
              checked={choice === c.id}
              onChange={() => setChoice(c.id)}
            />
            {c.label}
          </label>
        ))}
      </fieldset>
      {choice === 'answer' ? (
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-question`}>
            {T.questionLabel}
          </label>
          <select
            id={`${ids}-question`}
            className="field__input"
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
          >
            {questions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.topic ? `${q.topic}: ` : ''}
                {q.text}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor={`${ids}-text`}>
          {T.textLabel}
        </label>
        <textarea
          id={`${ids}-text`}
          className="field__input"
          rows={3}
          maxLength={MAX_CHARS}
          value={text}
          aria-describedby={`${ids}-count`}
          onChange={(e) => setText(e.target.value)}
        />
        <p id={`${ids}-count`} className="field__hint">
          {T.textHint(SUGGESTED_CHARS)} {T.count(text.length, MAX_CHARS)}
        </p>
      </div>
      {injects.length > 0 ? (
        <div className="field">
          <label className="field__label" htmlFor={`${ids}-inject`}>
            {T.injectLabel}
          </label>
          <select
            id={`${ids}-inject`}
            className="field__input"
            value={rowId}
            onChange={(e) => setRowId(e.target.value)}
          >
            <option value="">{T.noInject}</option>
            {injects.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <label className="choice__option hw-compose__anon">
        <input
          type="checkbox"
          checked={anonymous}
          aria-describedby={`${ids}-anon`}
          onChange={(e) => setAnonymous(e.target.checked)}
        />
        {T.anonymousLabel(named)}
      </label>
      <p id={`${ids}-anon`} className="field__hint">
        {anonymous ? T.anonymousNote : T.attributionNote(roleName, named)}
      </p>
      <button type="submit" className="btn btn--primary btn--block" disabled={!text.trim()}>
        {T.post}
      </button>
      {note ? (
        <p className="field__hint" role="status">
          {note}
        </p>
      ) : null}
    </form>
  )
}
