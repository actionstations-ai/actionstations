import { useState } from 'react'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { errorText } from '../../../lib/errors'
import type { LiveHotwash } from './use-live-hotwash'

/** Open and close the hot wash on devices, choose moderation, and put the board on the projector. */
export function HotWashControls({ live }: { live: LiveHotwash }) {
  const [busy, setBusy] = useState(false)
  const board = live.board
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      toast.error('The hot wash did not change', errorText(err))
    } finally {
      setBusy(false)
    }
  }
  if (!live.active)
    return (
      <p className="fac-hint">
        Start a live session on the Live tab to collect the hot wash from devices.
      </p>
    )
  const open = board?.open ?? false
  const review = board?.review ?? false
  return (
    <div className="fac-hw__controls">
      <p className="fac-hw__state" role="status">
        {open ? 'Open on devices' : 'Closed on devices'}
        {open ? (review ? ' · items wait for review' : ' · items show at once') : ''}
      </p>
      <div className="row">
        {open ? (
          <Button disabled={busy} onClick={() => void run(live.close)}>
            Close on devices
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => void run(() => live.open(review))}
          >
            Open on devices
          </Button>
        )}
        <label className="fac-hw__review">
          <input
            type="checkbox"
            checked={review}
            disabled={busy}
            onChange={(e) => void run(() => live.setReview(e.target.checked))}
          />
          Review before showing
        </label>
        <Button disabled={busy} onClick={() => void run(live.present)}>
          Show on screen
        </Button>
      </div>
    </div>
  )
}
