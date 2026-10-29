// A running relay or self-hosted session (spec 0410 FR-6): the connection kind, host and security,
// devices connected, the join links and Stop. The connection cannot change while it runs.
import { useState } from 'react'
import type { LiveSessionStatus } from '@shared/schemas/live'
import { Button } from '../../../components/ui'
import { InviteCard } from './InviteCard'
import { CONNECTION, LIVE } from './strings'
import type { LiveBusy } from './use-live-session'

export function RemotePanel(props: {
  status: LiveSessionStatus
  busy: LiveBusy
  onStop: () => void
}) {
  const { status } = props
  const [showStaff, setShowStaff] = useState(false)
  const remote = status.remote
  if (!remote || !status.invites) return null
  const kind = remote.kind === 'relay' ? CONNECTION.relay.title : CONNECTION.selfHosted.title
  return (
    <div className="live-running">
      <p className="fac-status live-status" role="status" aria-live="polite">
        <strong>{LIVE.running}</strong> ·{' '}
        {CONNECTION.runningOn(kind, remote.host, CONNECTION.security[remote.security])} ·{' '}
        {LIVE.connected(status.connected)}
      </p>
      {remote.security === 'http' && (
        <p className="live-warning" role="alert">
          {CONNECTION.selfHosted.noTlsWarning}
        </p>
      )}
      <InviteCard title={LIVE.playersLink} invite={status.invites.players} />
      <div className="row">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowStaff((s) => !s)}
          aria-expanded={showStaff}
        >
          {showStaff ? LIVE.hideStaff : LIVE.showStaff}
        </Button>
      </div>
      {showStaff && (
        <InviteCard
          title={LIVE.staffLink}
          invite={status.invites.staff}
          help={LIVE.staffLinkHelp}
          size={180}
        />
      )}
      <p className="muted">{CONNECTION.remoteKeepAwake}</p>
      <div className="live-actions">
        <Button
          variant="danger"
          disabled={props.busy !== 'idle'}
          onClick={() => {
            if (window.confirm(LIVE.confirmStop)) props.onStop()
          }}
        >
          {props.busy === 'stopping' ? LIVE.stopping : LIVE.stop}
        </Button>
      </div>
    </div>
  )
}
