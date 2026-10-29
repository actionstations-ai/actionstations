// Send surveys to participants' devices (spec 0422 FR-5, FR-7). With a live session running a
// survey goes out to the room; without one, "Start a survey session" opens a session for
// surveys only on this computer and shows the join code, so people answer on their phones.
// Counts say how many devices answered, never who.
import { useState } from 'react'
import type { Survey } from '@shared/schemas/survey'
import type { LiveSurveyView } from '@shared/schemas/live'
import { Badge, Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { errorText } from '../../../lib/errors'
import { useIpcQuery } from '../../../lib/query'
import { InviteCard } from './InviteCard'
import { useLiveSurveys, type LiveSurveys } from './use-live-surveys'
import '../facilitate.css'
import './survey-send.css'

type Item = Pick<Survey, 'id' | 'title' | 'status'>

const SURVEY_SEND = {
  heading: 'Surveys on devices',
  intro:
    'Participants answer on their own phones. Answers are anonymous: nothing links an answer to a person or a device.',
  none: 'No surveys to send yet. Create one on the Surveys page.',
  send: 'Send to devices',
  sendAgain: 'Send again',
  start: 'Start a survey session and send',
  close: 'Close survey',
  endSession: 'End survey session',
  draft: 'Draft',
  open: 'Open',
  closed: 'Closed',
  answered: (n: number, of: number) => `${n} of ${of} answered`,
  sessionNote:
    'A survey session runs on this computer only while it is open. Participants scan the code to join; nothing else is shared with them.',
  inRoom: 'Sent to everyone in the live session.',
  scanTitle: 'Join with a phone',
  scanHelp: 'Participants scan this code or open the link. They see surveys only.',
} as const

const fail = (title: string) => (e: unknown) => toast.error(title, new Error(errorText(e)))

/** The newest sending of each survey. */
function latestBySurvey(views: LiveSurveyView[]): Map<string, LiveSurveyView> {
  const out = new Map<string, LiveSurveyView>()
  for (const v of [...views].sort((a, b) => a.openedAt - b.openedAt)) out.set(v.surveyId, v)
  return out
}

function SurveyLine(props: { item: Item; view: LiveSurveyView | undefined; live: LiveSurveys }) {
  const { item, view, live } = props
  const [busy, setBusy] = useState(false)
  const run = (what: () => Promise<void>, title: string) => {
    setBusy(true)
    what()
      .catch(fail(title))
      .finally(() => setBusy(false))
  }
  const open = view?.status === 'open'
  return (
    <li className="fac-surveys__row">
      <div className="fac-surveys__main">
        <span className="fac-surveys__title">{item.title}</span>
        {item.status === 'draft' && <Badge tone="info">{SURVEY_SEND.draft}</Badge>}
        {view && (
          <span role="status" className="muted">
            {open ? SURVEY_SEND.open : SURVEY_SEND.closed} ·{' '}
            {SURVEY_SEND.answered(view.responses, view.eligible)}
          </span>
        )}
      </div>
      {open ? (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => run(() => live.close(view.deliveryId), 'Could not close the survey')}
        >
          {SURVEY_SEND.close}
        </Button>
      ) : live.active ? (
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => run(() => live.send(item.id), 'Could not send the survey')}
        >
          {view ? SURVEY_SEND.sendAgain : SURVEY_SEND.send}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          onClick={() => run(() => live.startAndSend(item.id), 'Could not start the session')}
        >
          {SURVEY_SEND.start}
        </Button>
      )}
    </li>
  )
}

export function SurveySend(props: { projectPath: string; scenarioId: string; surveys: Item[] }) {
  const live = useLiveSurveys(props.projectPath, props.scenarioId)
  const latest = latestBySurvey(live.views)
  const sendable = props.surveys.filter((s) => s.status !== 'archived')
  return (
    <section className="fac-surveys" aria-labelledby="fac-surveys-title">
      <h2 id="fac-surveys-title" className="live-heading">
        {SURVEY_SEND.heading}
      </h2>
      <p className="muted">{SURVEY_SEND.intro}</p>
      {sendable.length === 0 ? (
        <p className="muted">{SURVEY_SEND.none}</p>
      ) : (
        <ul className="fac-surveys__list">
          {sendable.map((s) => (
            <SurveyLine key={s.id} item={s} view={latest.get(s.id)} live={live} />
          ))}
        </ul>
      )}
      {live.active && !live.surveyOnly && <p className="muted">{SURVEY_SEND.inRoom}</p>}
      {!live.active && <p className="muted">{SURVEY_SEND.sessionNote}</p>}
      {live.surveyOnly && live.invite && (
        <>
          <InviteCard
            title={SURVEY_SEND.scanTitle}
            invite={live.invite}
            help={SURVEY_SEND.scanHelp}
            size={220}
          />
          <Button onClick={() => void live.end().catch(fail('Could not end the session'))}>
            {SURVEY_SEND.endSession}
          </Button>
        </>
      )}
    </section>
  )
}

/** The Live tab's list: every survey of the scenario. */
export function LiveSurveysSection(props: { projectPath: string; scenarioId: string }) {
  const list = useIpcQuery('surveys:list', {
    projectPath: props.projectPath,
    scenarioId: props.scenarioId,
  })
  return (
    <SurveySend
      projectPath={props.projectPath}
      scenarioId={props.scenarioId}
      surveys={(list.data ?? []).map((i) => i.survey)}
    />
  )
}
