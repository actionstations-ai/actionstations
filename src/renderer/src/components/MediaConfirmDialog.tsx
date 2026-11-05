// Paid media confirmation: lists the image, video and audio calls a media batch will make to
// each cloud provider, with an estimated cost when a price per call is set, and asks to
// continue. Each provider has "Don't ask again for this provider". Escape cancels.
import { useEffect, useState } from 'react'
import type { MediaConfirmNeededEvent } from '@shared/ipc/media-confirm'
import { call, subscribe } from '../lib/api'
import { describeCounts, formatUsd } from './media-confirm-format'
import { toast } from './toast-store'
import { Button, Dialog } from './ui'

export function MediaConfirmDialog(props: {
  request: MediaConfirmNeededEvent
  onAnswer: (decision: 'continue' | 'cancel', dontAskAgain: string[]) => void
  busy?: boolean
}) {
  const { request } = props
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) =>
    setSkip((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  const total = request.totalEstimateUsd
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) props.onAnswer('cancel', [])
      }}
      title="Generate media with a paid service?"
      description="These calls go to cloud services and may be charged to your account. Nothing is sent until you continue."
      footer={
        <>
          <Button
            variant="ghost"
            disabled={props.busy}
            onClick={() => props.onAnswer('cancel', [])}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={props.busy}
            onClick={() => props.onAnswer('continue', [...skip])}
          >
            Continue
          </Button>
        </>
      }
    >
      <ul className="stack" aria-label="Planned paid calls">
        {request.providers.map((p) => (
          <li key={p.providerId} className="stack">
            <p>
              <strong>{p.label}</strong>
              {p.host ? <span className="muted"> ({p.host})</span> : null}
              {': '}
              {describeCounts(p.counts)}
              {p.estimateUsd !== undefined ? `, about ${formatUsd(p.estimateUsd)}` : ''}
            </p>
            <label className="row">
              <input
                type="checkbox"
                checked={skip.has(p.providerId)}
                onChange={() => toggle(p.providerId)}
              />
              <span>Don&apos;t ask again for {p.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="muted" role="note">
        {total !== undefined
          ? `Estimated total: about ${formatUsd(total)}, from the price per call you set. Actual charges depend on the service.`
          : 'No price per call is set, so no estimate is shown. You can set one under Advanced in the provider’s settings.'}
      </p>
    </Dialog>
  )
}

/** App-wide host: shows one confirmation at a time and sends the answer to main. */
export function MediaConfirmHost() {
  const [queue, setQueue] = useState<MediaConfirmNeededEvent[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => subscribe('media:confirm-needed', (e) => setQueue((q) => [...q, e])), [])
  const current = queue[0]
  if (!current) return null
  const answer = async (decision: 'continue' | 'cancel', dontAskAgain: string[]) => {
    setBusy(true)
    try {
      await call('media:confirm-answer', { requestId: current.requestId, decision, dontAskAgain })
    } catch (err) {
      toast.error('Could not send your answer', err)
    } finally {
      setBusy(false)
      setQueue((q) => q.filter((r) => r.requestId !== current.requestId))
    }
  }
  return (
    <MediaConfirmDialog key={current.requestId} request={current} busy={busy} onAnswer={answer} />
  )
}
