import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { BoardList } from './BoardList'
import { shownCount } from './hotwash'
import { ItemComposer } from './ItemComposer'

const T = STRINGS.hotwash

/** The hot wash on a device: the questions, a composer while it is open, and the shared board. */
export function HotWashScreen({ session, onBack }: { session: PlayerSession; onBack: () => void }) {
  const open = useStore(session.store, (s) => s.hotwash.open)
  const onBoard = useStore(session.store, (s) => shownCount(s.hotwash))
  const hotwash = useStore(session.store, (s) => s.info?.hotwash)
  const seat = useStore(session.store, (s) => s.seat)
  const questions = hotwash?.questions ?? []
  const mayPost = seat?.kind === 'player' || seat?.kind === 'evaluator'
  return (
    <section className="screen" aria-labelledby="hotwash-heading" data-screen="hotwash">
      <button type="button" className="btn btn--quiet back" onClick={onBack}>
        <span aria-hidden="true">‹ </span>
        {T.back}
      </button>
      <div className="screen__head">
        <h1 id="hotwash-heading">{T.heading}</h1>
        <p className="hw-status" data-open={open}>
          {open ? T.openStatus : T.closedStatus}
        </p>
      </div>
      {hotwash?.methodDescription ? <p className="muted">{hotwash.methodDescription}</p> : null}
      {questions.length > 0 ? (
        <section aria-labelledby="hw-questions">
          <h2 id="hw-questions">{T.questionsHeading}</h2>
          <ol className="hw-questions">
            {questions.map((q) => (
              <li key={q.id}>
                {q.topic ? <strong>{q.topic}: </strong> : null}
                {q.text}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {open && mayPost ? (
        <ItemComposer session={session} />
      ) : (
        <p className="muted">{open ? T.readOnlyNote : onBoard > 0 ? T.closedNote : T.notOpenYet}</p>
      )}
      <BoardList session={session} />
    </section>
  )
}
