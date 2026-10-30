import { useId, useState } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import type { HelperDraft, SimcellHelperFeature } from './helper'
import { SIMCELL } from './strings'
import './simcell.css'

/** The SimCell helper's queue: each reply the controller drafted, to send, edit or discard. */
export function SimcellScreen({ session, onBack }: { session: PlayerSession; onBack: () => void }) {
  const feature = session.simcell
  if (!feature) return null
  return <Queue feature={feature} onBack={onBack} />
}

function Queue({ feature, onBack }: { feature: SimcellHelperFeature; onBack: () => void }) {
  const drafts = useStore(feature.state, (s) => s.drafts)
  const ended = useStore(feature.state, (s) => s.ended)
  return (
    <section className="screen simcell" aria-labelledby="simcell-heading" data-screen="simcell">
      <button type="button" className="btn btn--quiet back" onClick={onBack}>
        <span aria-hidden="true">‹ </span>
        {SIMCELL.back}
      </button>
      <div className="screen__head">
        <h1 id="simcell-heading">{SIMCELL.heading}</h1>
      </div>
      <p className="simcell__rule">{SIMCELL.rule}</p>
      {ended ? <p className="join__attribution">{SIMCELL.ended}</p> : null}
      <p role="status" className="muted">
        {SIMCELL.waiting(drafts.length)}
      </p>
      <ul className="simcell__list">
        {drafts.map((d) => (
          <li key={`${d.draftId}:${d.revision}`}>
            <DraftCard draft={d} feature={feature} readOnly={ended} />
          </li>
        ))}
      </ul>
    </section>
  )
}

function DraftCard({
  draft,
  feature,
  readOnly,
}: {
  draft: HelperDraft
  feature: SimcellHelperFeature
  readOnly: boolean
}) {
  const id = useId()
  const [text, setText] = useState(draft.text)
  const changed = text.trim() !== draft.text.trim()
  const empty = text.trim() === ''
  return (
    <article className="card simcell__card" aria-labelledby={`${id}-who`}>
      <h2 id={`${id}-who`} className="h3">
        {draft.persona}
      </h2>
      <p className="muted">{draft.threadLabel}</p>
      {draft.playerMessage ? (
        <blockquote className="simcell__quote">
          <span className="simcell__quote-label">{SIMCELL.playerSaid}</span>
          {draft.playerMessage}
        </blockquote>
      ) : null}
      {draft.flags.length > 0 ? (
        <ul className="simcell__flags" aria-label={SIMCELL.flags}>
          {draft.flags.map((f) => (
            <li key={f.code}>{f.message}</li>
          ))}
        </ul>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor={`${id}-text`}>
          {SIMCELL.reply}
        </label>
        <textarea
          id={`${id}-text`}
          className="field__input simcell__text"
          rows={5}
          maxLength={4000}
          value={text}
          readOnly={readOnly}
          onChange={(e) => setText(e.target.value)}
        />
        {empty ? (
          <p className="field__hint" role="alert">
            {SIMCELL.emptyReply}
          </p>
        ) : null}
      </div>
      <div className="simcell__actions">
        {changed ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={readOnly || empty}
            onClick={() => void feature.decide(draft.draftId, 'edit', text)}
          >
            {SIMCELL.sendEdited}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            disabled={readOnly}
            onClick={() => void feature.decide(draft.draftId, 'approve')}
          >
            {SIMCELL.approve}
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={readOnly}
          onClick={() => void feature.decide(draft.draftId, 'discard')}
        >
          {SIMCELL.discard}
        </button>
      </div>
    </article>
  )
}
