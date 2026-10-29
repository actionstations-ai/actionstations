// App-wide host for cloud approvals (#433): listens for requests waiting for approval, shows a
// notice with a Review button (and a toast when one arrives) and opens the approval dialog.
import { useEffect } from 'react'
import { OutboundApprovalDialog } from '../OutboundApprovalDialog'
import { toast } from '../toast-store'
import { Button } from '../ui'
import { connectApprovals, useApprovals } from './approvals-store'
import './privacy.css'

export function ApprovalHost() {
  const pending = useApprovals((s) => s.pending)
  const openId = useApprovals((s) => s.openId)
  const open = useApprovals((s) => s.open)
  const close = useApprovals((s) => s.close)

  useEffect(
    () =>
      connectApprovals((m) => {
        if (m)
          toast.info(
            'A cloud request is waiting for your approval',
            `Nothing goes to ${m.host || m.providerLabel} until you review it.`,
          )
      }),
    [],
  )

  const current = pending.find((p) => p.requestId === openId)
  const first = pending[0]
  return (
    <>
      {first && !current && (
        <aside className="approval-banner" aria-labelledby="approval-banner-text">
          <p id="approval-banner-text" role="status">
            {pending.length === 1
              ? `A request is waiting for your approval before it goes to ${first.host || first.providerLabel}.`
              : `${pending.length} requests are waiting for your approval before they go to the cloud.`}
          </p>
          <div className="row">
            <Button variant="primary" onClick={() => open(first.requestId)}>
              Review
            </Button>
          </div>
        </aside>
      )}
      {current && (
        <OutboundApprovalDialog
          key={current.requestId}
          manifest={current}
          open
          onOpenChange={(o) => {
            if (!o) close()
          }}
        />
      )}
    </>
  )
}
