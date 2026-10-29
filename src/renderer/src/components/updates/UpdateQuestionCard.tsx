// The one-time question on the Projects screen (#442) for users who never answered it in the
// setup wizard: check for new versions, yes or no. Unanswered, it comes back on the next launch,
// three launches at most; then the answer is "no" (main stores `off`).
import { useEffect, useId } from 'react'
import { Button } from '../ui'
import { toast } from '../toast-store'
import { focusTarget } from '../../lib/focus'
import { MAX_ASKS_SHOWN, useAskedThisLaunch } from './ask-state'
import { WHAT_IS_SENT } from './update-view'
import { setUpdates, useUpdateStatus } from './use-updates'
import './updates.css'

export function UpdateQuestionCard() {
  const status = useUpdateStatus().data
  const headingId = useId()
  const asked = useAskedThisLaunch((s) => s.asked)
  const markAsked = useAskedThisLaunch((s) => s.mark)
  const show = !!status && status.mode === 'ask' && (asked || status.askedCount < MAX_ASKS_SHOWN)

  useEffect(() => {
    // getState, not the render's value: StrictMode runs this effect twice with one closure.
    if (!show || useAskedThisLaunch.getState().asked) return
    markAsked()
    void setUpdates({ asked: true }).catch(() => undefined)
  }, [show, markAsked])

  if (!show) return null
  const answer = async (check: 'on' | 'off') => {
    try {
      await setUpdates({ check })
      focusTarget(document.querySelector<HTMLElement>('#main h1'))
      toast.info(
        check === 'on' ? 'The update check is on' : 'The update check is off',
        'Change it any time in Settings → Updates.',
      )
    } catch (err) {
      toast.error('Could not save your choice', err)
    }
  }
  return (
    <section className="card update-question" aria-labelledby={headingId}>
      <h2 id={headingId} className="update-question__title">
        Check for new versions?
      </h2>
      <p>
        Action Stations can check GitHub for a newer release when it starts, at most once a day.{' '}
        {WHAT_IS_SENT} Nothing is downloaded or installed.
      </p>
      <div className="row">
        <Button size="sm" variant="primary" onClick={() => void answer('on')}>
          Turn on
        </Button>
        <Button size="sm" onClick={() => void answer('off')}>
          No thanks
        </Button>
      </div>
    </section>
  )
}
