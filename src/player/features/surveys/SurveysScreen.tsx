import { useState } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { SurveyForm } from './SurveyForm'
import { mayAnswer, orderedSurveys, type PlayerSurvey } from './surveys'

const T = STRINGS.surveys

function statusOf(s: PlayerSurvey): string {
  if (s.mine) return T.answered
  return s.status === 'open' ? T.open : T.closed
}

function SurveyList({
  surveys,
  onPick,
}: {
  surveys: PlayerSurvey[]
  onPick: (surveyId: string) => void
}) {
  if (!surveys.length) {
    return (
      <>
        <p>{T.none}</p>
        <p className="muted">{T.noneHint}</p>
      </>
    )
  }
  return (
    <ul className="menu">
      {surveys.map((s) => (
        <li key={s.surveyId} className="menu__item">
          <button type="button" className="menu__btn" onClick={() => onPick(s.surveyId)}>
            <span className="menu__label">{s.title}</span>
            <span className="menu__why">{statusOf(s)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * Surveys under More (spec 0422 FR-5): the list of surveys sent to this device, and one survey
 * at a time as a form. `initialId` opens a survey straight away (the banner).
 */
export function SurveysScreen({
  session,
  initialId,
  onBack,
}: {
  session: PlayerSession
  initialId?: string | undefined
  onBack: () => void
}) {
  const surveys = useStore(session.store, (s) => s.surveys)
  const seat = useStore(session.store, (s) => s.seat)
  const clientId = useStore(session.store, (s) => s.clientId)
  const [picked, setPicked] = useState<string | undefined>(initialId)
  const view = seat && {
    clientId,
    kind: seat.kind,
    roleId: seat.role?.id,
    teamId: seat.role?.teamId,
  }
  const mine = orderedSurveys(surveys).filter((s) => mayAnswer(s, view))
  const current = picked ? surveys[picked] : undefined
  const alone = mine.length === 1 && mine[0]!.status === 'open' ? mine[0] : undefined
  const shown = current ?? alone

  return (
    <section className="screen" aria-labelledby="surveys-heading" data-screen="surveys">
      <button
        type="button"
        className="btn btn--quiet back"
        onClick={shown && !alone ? () => setPicked(undefined) : onBack}
      >
        <span aria-hidden="true">‹ </span>
        {shown && !alone ? T.backToList : T.back}
      </button>
      <div className="screen__head">
        <h1 id="surveys-heading">{shown ? shown.title : T.heading}</h1>
      </div>
      {shown ? (
        <>
          {shown.intro ? <p>{shown.intro}</p> : null}
          {mayAnswer(shown, view) ? (
            <SurveyForm key={shown.surveyId} session={session} survey={shown} />
          ) : (
            <p className="muted">{T.notForYou}</p>
          )}
        </>
      ) : (
        <SurveyList surveys={mine} onPick={setPicked} />
      )}
    </section>
  )
}
