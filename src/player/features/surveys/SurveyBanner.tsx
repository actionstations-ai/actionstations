import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import { mayAnswer, orderedSurveys } from './surveys'

/** A button under the header while a survey for this seat is open and unanswered. */
export function SurveyBanner({
  session,
  onOpen,
  viewing,
}: {
  session: PlayerSession
  onOpen: (surveyId: string) => void
  /** True while the surveys screen is showing; its banner would only repeat it. */
  viewing: boolean
}) {
  const surveys = useStore(session.store, (s) => s.surveys)
  const seat = useStore(session.store, (s) => s.seat)
  const clientId = useStore(session.store, (s) => s.clientId)
  if (viewing || !seat) return null
  const view = { clientId, kind: seat.kind, roleId: seat.role?.id, teamId: seat.role?.teamId }
  const waiting = orderedSurveys(surveys).find(
    (s) => s.status === 'open' && !s.mine && mayAnswer(s, view),
  )
  if (!waiting) return null
  return (
    <div className="vote-banner">
      <button
        type="button"
        className="btn btn--primary btn--block"
        onClick={() => onOpen(waiting.surveyId)}
      >
        {STRINGS.surveys.bannerOpen}: {waiting.title}
      </button>
    </div>
  )
}
