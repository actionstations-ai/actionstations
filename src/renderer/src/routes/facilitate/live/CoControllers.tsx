// The co-controllers of a regional exercise (#440 FR-19): which partner organizations may
// release their own rows and roles in this session, whether devices have the roster, and a button
// to send it again once a partner's key has been pinned. Shown only for a regional exercise.
import { useState } from 'react'
import type { PartnerInviteView, RegionalRosterView } from '@shared/schemas/live'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { call } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { PARTNER } from './partner-strings'
import './partner.css'

function rosterStatus(view: RegionalRosterView): string {
  if (view.sent) return `Devices have roster ${view.revision ?? 1}.`
  if (view.controllers.length === 0) return 'No partner organization can be listed yet.'
  return 'Not sent to devices yet.'
}

function permissionsText(permissions: readonly string[] | undefined): string {
  return (permissions ?? ['inject']).map((p) => PARTNER.permissions[p] ?? p).join(', ')
}

/** The secret invite, shown once: copy it, then clear it from the screen. */
export function PartnerInviteBox(props: { invite: PartnerInviteView; onClose: () => void }) {
  const { invite } = props
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.invite)
      toast.success(PARTNER.inviteCopied)
    } catch {
      toast.error('Could not copy the invite', new Error('Clipboard unavailable'))
    }
  }
  return (
    <section className="partner-box" aria-label={PARTNER.inviteTitle(invite.name)}>
      <h4 className="live-note__title">{PARTNER.inviteTitle(invite.name)}</h4>
      <p className="partner-warning">{PARTNER.inviteWarning(invite.name)}</p>
      <label className="field__label" htmlFor="partner-invite-text">
        {PARTNER.inviteLabel}
      </label>
      <textarea
        id="partner-invite-text"
        className="field__input partner-box__secret"
        readOnly
        value={invite.invite}
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="partner-box__actions">
        <Button size="sm" variant="primary" onClick={() => void copy()}>
          {PARTNER.inviteCopy}
        </Button>
        <Button size="sm" onClick={props.onClose}>
          {PARTNER.inviteClose}
        </Button>
      </div>
    </section>
  )
}

export function CoControllersView(props: {
  view: RegionalRosterView
  busy: boolean
  onSend: () => void
  /** Mint a partner's invite; absent where a session cannot take one. */
  onInvite?: (orgId: string) => void
  invite?: PartnerInviteView
  onCloseInvite?: () => void
  staffSeats?: { locked: boolean; granted: boolean }
  onGrantStaffSeats?: (granted: boolean) => void
}) {
  const { view } = props
  return (
    <section className="live-devices" aria-labelledby="live-cocontrollers-heading">
      <h3 id="live-cocontrollers-heading" className="live-note__title">
        Co-controllers
      </h3>
      <p role="status">{rosterStatus(view)}</p>
      {view.controllers.length > 0 && (
        <table className="table room-table">
          <caption className="sr-only">Partner organizations that may release injects</caption>
          <thead>
            <tr>
              <th scope="col">Organization</th>
              <th scope="col">Rows</th>
              <th scope="col">Roles</th>
              <th scope="col">{PARTNER.mayHeader}</th>
              {props.onInvite && (
                <th scope="col">
                  <span className="sr-only">{PARTNER.invite}</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {view.controllers.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.name}</th>
                <td>{c.rowPrefixes.join(', ') || 'None'}</td>
                <td>{c.roleCount}</td>
                <td>{permissionsText(c.permissions)}</td>
                {props.onInvite && (
                  <td>
                    <Button
                      size="sm"
                      disabled={props.busy}
                      aria-label={PARTNER.inviteFor(c.name)}
                      onClick={() => props.onInvite?.(c.id)}
                    >
                      {PARTNER.invite}
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view.missingLiveKey.length > 0 && (
        <p className="muted">
          No live key is pinned for {view.missingLiveKey.join(', ')}. Pin it in the regional
          exercise, then send the roster again.
        </p>
      )}
      <div className="row">
        <Button size="sm" disabled={props.busy} onClick={props.onSend}>
          Send roster to devices
        </Button>
      </div>
      {props.staffSeats?.locked && (
        <div className="partner-warning">
          <p>{PARTNER.staffClosed}</p>
          <label className="partner-switch">
            <input
              type="checkbox"
              checked={props.staffSeats.granted}
              onChange={(e) => props.onGrantStaffSeats?.(e.target.checked)}
            />
            {PARTNER.staffGrant}
          </label>
        </div>
      )}
      {props.invite && props.onCloseInvite && (
        <PartnerInviteBox invite={props.invite} onClose={props.onCloseInvite} />
      )}
    </section>
  )
}

export function CoControllers(props: { projectPath: string; scenarioId: string }) {
  const req = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const roster = useIpcQuery('live:regional-roster', req, { refetchInterval: 30_000 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<PartnerInviteView>()
  const seats = useIpcQuery('live:staff-seats', req, { refetchInterval: 5_000 })
  const view = roster.data
  if (!view || (view.controllers.length === 0 && view.missingLiveKey.length === 0)) return null
  const send = () => {
    setBusy(true)
    setError('')
    call('live:regional-roster-send', req)
      .then(() => queryClient.invalidateQueries({ queryKey: ['live:regional-roster'] }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not send the roster'))
      .finally(() => setBusy(false))
  }
  const makeInvite = (orgId: string) => {
    setBusy(true)
    setError('')
    call('live:partner-invite', { ...req, orgId })
      .then(setInvite)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : PARTNER.inviteError))
      .finally(() => setBusy(false))
  }
  return (
    <>
      <CoControllersView
        view={view}
        busy={busy}
        onSend={send}
        onInvite={makeInvite}
        {...(invite ? { invite } : {})}
        onCloseInvite={() => setInvite(undefined)}
        {...(seats.data ? { staffSeats: seats.data } : {})}
        onGrantStaffSeats={(granted) =>
          void call('live:staff-seats-set', { ...req, granted }).then(() =>
            queryClient.invalidateQueries({ queryKey: ['live:staff-seats'] }),
          )
        }
      />
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
