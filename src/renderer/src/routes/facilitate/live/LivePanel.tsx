// The Live tab of facilitator mode (spec 0407 Renderer, #418): before a session, the address
// and security choice with the firewall note and Start; while it runs, the join QR codes
// (players link on screen, staff link behind a button), the URL with Copy link, the status
// line (a live region), Switch address and Stop. After a minute with no device the firewall
// recovery text appears inline.
import { useState } from 'react'
import type { InviteView, LanAddress, LiveSessionStatus } from '@shared/schemas/live'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { QrCode } from './QrCode'
import { LIVE } from './strings'
import { useLiveSession, type LiveBusy } from './use-live-session'

const NO_CONNECTIONS_AFTER_MS = 60_000

const KIND_LABEL: Record<LanAddress['kind'], string> = {
  wifi: 'Wi-Fi',
  ethernet: 'Ethernet',
  virtual: 'virtual',
  other: '',
}

function addressLabel(a: LanAddress): string {
  const kind = KIND_LABEL[a.kind]
  const tail = [
    a.interface,
    kind,
    a.recommended ? 'recommended' : '',
    a.linkLocal ? 'self-assigned' : '',
  ]
    .filter(Boolean)
    .join(' · ')
  return `${a.address} — ${tail}`
}

function AddressSelect(props: {
  id: string
  addresses: LanAddress[]
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <select
      id={props.id}
      className="select"
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value)}
    >
      {props.addresses.map((a) => (
        <option key={`${a.interface}-${a.address}`} value={a.address}>
          {addressLabel(a)}
        </option>
      ))}
    </select>
  )
}

function Setup(props: {
  addresses: LanAddress[]
  firewall: string | undefined
  busy: LiveBusy
  onStart: (
    address: string,
    tls: 'self-signed' | 'none',
    attribution: 'role' | 'named',
    allowPublic: boolean,
  ) => void
}) {
  const recommended = props.addresses.find((a) => a.recommended) ?? props.addresses[0]
  const [address, setAddress] = useState(recommended?.address ?? '')
  const [tls, setTls] = useState<'self-signed' | 'none'>('self-signed')
  const [attribution, setAttribution] = useState<'role' | 'named'>('role')
  const usable = props.addresses.filter((a) => !a.linkLocal)
  const chosen = address || recommended?.address
  const chosenIsPublic = props.addresses.some((a) => a.address === chosen && !a.private)
  // Plain HTTP and a public address each need a separate, explicit yes (#457 review M2, L3).
  const confirmed = () =>
    (tls !== 'none' || window.confirm(LIVE.confirmHttp)) &&
    (!chosenIsPublic || window.confirm(LIVE.confirmPublic))
  return (
    <form
      className="live-setup"
      onSubmit={(e) => {
        e.preventDefault()
        if (chosen && confirmed()) props.onStart(chosen, tls, attribution, chosenIsPublic)
      }}
    >
      <p className="muted">{LIVE.intro}</p>
      {props.addresses.length === 0 && (
        <p className="field__error" role="alert">
          {LIVE.noNetwork}
        </p>
      )}
      {props.addresses.length > 0 && usable.length === 0 && (
        <p className="live-warning" role="alert">
          {LIVE.linkLocalOnly}
        </p>
      )}
      <div className="field">
        <label className="field__label" htmlFor="live-address">
          {LIVE.addressLabel}
        </label>
        <AddressSelect
          id="live-address"
          addresses={props.addresses}
          value={chosen ?? ''}
          onChange={setAddress}
        />
        <p className="field__help muted">{LIVE.addressHelp}</p>
        {chosenIsPublic && (
          <p className="live-warning" role="alert">
            {LIVE.publicAddress}
          </p>
        )}
      </div>
      <fieldset className="live-fieldset">
        <legend className="field__label">{LIVE.securityLegend}</legend>
        <label className="live-radio">
          <input
            type="radio"
            name="live-tls"
            checked={tls === 'self-signed'}
            onChange={() => setTls('self-signed')}
          />
          <span>
            {LIVE.https}
            <span className="muted live-radio__help">{LIVE.httpsHelp}</span>
          </span>
        </label>
        <label className="live-radio">
          <input
            type="radio"
            name="live-tls"
            checked={tls === 'none'}
            onChange={() => setTls('none')}
          />
          <span>
            {LIVE.http}
            <span className="muted live-radio__help">{LIVE.httpWarning}</span>
          </span>
        </label>
      </fieldset>
      <fieldset className="live-fieldset">
        <legend className="field__label">{LIVE.attributionLegend}</legend>
        <label className="live-radio">
          <input
            type="radio"
            name="live-attr"
            checked={attribution === 'role'}
            onChange={() => setAttribution('role')}
          />
          <span>{LIVE.attributionRole}</span>
        </label>
        <label className="live-radio">
          <input
            type="radio"
            name="live-attr"
            checked={attribution === 'named'}
            onChange={() => setAttribution('named')}
          />
          <span>{LIVE.attributionNamed}</span>
        </label>
      </fieldset>
      {props.firewall && (
        <section className="live-note" aria-labelledby="live-firewall-heading">
          <h3 id="live-firewall-heading" className="live-note__title">
            {LIVE.firewallHeading}
          </h3>
          <p>{props.firewall}</p>
        </section>
      )}
      <Button type="submit" variant="primary" disabled={!chosen || props.busy !== 'idle'}>
        {props.busy === 'starting' ? LIVE.starting : LIVE.start}
      </Button>
    </form>
  )
}

function InviteCard(props: { title: string; invite: InviteView; help?: string; size?: number }) {
  const { url } = props.invite
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(LIVE.copied)
    } catch {
      toast.error('Could not copy the link', new Error('Clipboard unavailable'))
    }
  }
  return (
    <section className="live-invite" aria-label={props.title}>
      <h3 className="live-invite__title">{props.title}</h3>
      {props.help && <p className="muted live-invite__help">{props.help}</p>}
      <div className="live-invite__body">
        <QrCode qr={props.invite.qr} label={LIVE.qrAlt(url)} size={props.size} />
        <div className="live-invite__link">
          <code className="live-invite__url">{url}</code>
          <Button size="sm" onClick={() => void copy()}>
            {LIVE.copyLink}
          </Button>
        </div>
      </div>
    </section>
  )
}

function Running(props: {
  status: LiveSessionStatus
  addresses: LanAddress[]
  firewallRecovery: string | undefined
  busy: LiveBusy
  onStop: () => void
  onSwitch: (address: string) => void
}) {
  const { status } = props
  const [showStaff, setShowStaff] = useState(false)
  const lan = status.lan
  const [address, setAddress] = useState(lan?.address ?? '')
  const quiet = (status.noConnectionsForMs ?? 0) >= NO_CONNECTIONS_AFTER_MS
  if (!lan || !status.invites) return null
  const tls = lan.tls === 'self-signed'
  return (
    <div className="live-running">
      <p className="fac-status live-status" role="status" aria-live="polite">
        <strong>{LIVE.running}</strong> · {LIVE.listening(lan.address, lan.port, tls)} ·{' '}
        {LIVE.connected(status.connected)}
      </p>
      {!tls && (
        <p className="live-warning" role="alert">
          {LIVE.httpBadge}
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
      {tls && lan.fingerprintSha256 && (
        <p className="live-fingerprint">
          <span className="field__label">{LIVE.fingerprint}</span>
          <code>{lan.fingerprintSha256}</code>
        </p>
      )}
      {quiet && props.firewallRecovery && (
        <section className="live-note live-note--warning" role="status">
          <h3 className="live-note__title">{LIVE.noConnectionsYet}</h3>
          <p>{props.firewallRecovery}</p>
        </section>
      )}
      <p className="muted">{LIVE.keepAwake}</p>
      <div className="live-actions">
        <label className="field live-switch">
          <span className="field__label">{LIVE.switchAddress}</span>
          <span className="row">
            <AddressSelect
              id="live-switch-address"
              addresses={props.addresses}
              value={address}
              onChange={setAddress}
              disabled={props.busy !== 'idle'}
            />
            <Button
              size="sm"
              disabled={props.busy !== 'idle' || !address || address === lan.address}
              onClick={() => props.onSwitch(address)}
            >
              {props.busy === 'switching' ? LIVE.switching : LIVE.switchAddress}
            </Button>
          </span>
        </label>
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

export function LivePanel(props: { projectPath: string; scenarioId: string }) {
  const live = useLiveSession(props.projectPath, props.scenarioId)
  if (live.loading) return <p className="muted">Loading…</p>
  const running = live.status?.session && !live.status.session.endedAt
  return (
    <div className="live-panel">
      <h2 className="live-heading">{LIVE.heading}</h2>
      {live.error && (
        <p className="field__error" role="alert">
          {LIVE.error}: {live.error}
        </p>
      )}
      {running && live.status ? (
        <Running
          status={live.status}
          addresses={live.addresses}
          firewallRecovery={live.firewall?.noConnections}
          busy={live.busy}
          onStop={() => void live.stop()}
          onSwitch={(address) => void live.switchAddress(address)}
        />
      ) : (
        <Setup
          addresses={live.addresses}
          firewall={live.firewall?.beforeStart}
          busy={live.busy}
          onStart={(address, tls, attribution, allowPublic) =>
            void live.start({ kind: 'lan', address, tls }, attribution, allowPublic)
          }
        />
      )}
    </div>
  )
}
