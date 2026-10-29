import { useState, type FormEvent } from 'react'
import { PROTOCOL_VERSION } from '../../shared/live/protocol'
import type { Seat } from '../../shared/live/schemas'
import { STAFF_KINDS } from '../../shared/live/schemas'
import { hintRole, type PlayerSession } from '../app/session'
import { useStore } from '../app/store'
import { STRINGS } from '../app/strings'
import { EmptyState } from '../components/EmptyState'

function seatStatus(seat: Seat, hasStaff: boolean): { text?: string; disabled: boolean } {
  if (STAFF_KINDS.has(seat.kind) && !hasStaff)
    return { text: STRINGS.join.seatNeedsStaff, disabled: true }
  if (seat.capacity === undefined) return { disabled: false }
  const full = seat.taken >= seat.capacity
  return {
    text: full
      ? `${STRINGS.join.seatsTaken(seat.taken, seat.capacity)} · ${STRINGS.join.seatFull}`
      : STRINGS.join.seatsTaken(seat.taken, seat.capacity),
    disabled: full,
  }
}

/** Pick a seat and an optional display name; the role hint from a per-role card preselects. */
export function JoinScreen({
  session,
  bundleVersion,
}: {
  session: PlayerSession
  bundleVersion: string
}) {
  const info = useStore(session.store, (s) => s.info)
  const roleHint = useStore(session.store, (s) => s.roleHint)
  const linkKind = useStore(session.store, (s) => s.linkKind)
  const joining = useStore(session.store, (s) => s.joining)
  const joinError = useStore(session.store, (s) => s.joinError)
  const connection = useStore(session.store, (s) => s.connection)
  const sessionId = useStore(session.store, (s) => s.sessionId)
  const seats = info?.seats ?? []
  const hasStaff = linkKind === 'staff'
  const hinted = seatForHint(seats, roleHint)
  const [picked, setSeatId] = useState<string | undefined>()
  const [name, setName] = useState('')
  // The per-role card's hint preselects until the player picks; the controller still decides.
  const seatId = picked ?? hinted?.id
  const chosen = seats.find((s) => s.id === seatId)
  const canJoin =
    !!chosen && !seatStatus(chosen, hasStaff).disabled && !joining && connection === 'connected'

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canJoin && seatId) void session.chooseSeat(seatId, name)
  }

  return (
    <main className="screen screen--join" data-screen="join" id="content">
      <header className="join__head">
        <p className="brand">{STRINGS.app}</p>
        <h1 className="join__title">{info?.scenarioTitle ?? STRINGS.join.liveExercise}</h1>
        <p className="join__sub">
          {STRINGS.join.liveExercise}
          {info?.sessionName ? ` · ${info.sessionName}` : ''}
          {sessionId ? ` · ${STRINGS.join.session} ${sessionId.slice(0, 6)}` : ''}
        </p>
      </header>
      {!info ? (
        <EmptyState title={STRINGS.join.waitingForFacilitator} hint={STRINGS.link.doNotShare} />
      ) : (
        <form className="join__form" onSubmit={submit} noValidate>
          <fieldset className="seats">
            <legend className="seats__legend">{STRINGS.join.heading}</legend>
            {seats.length === 0 ? (
              <EmptyState title={STRINGS.join.noSeats} />
            ) : (
              <ul className="seats__list">
                {seats.map((seat) => {
                  const status = seatStatus(seat, hasStaff)
                  const id = `seat-${seat.id}`
                  return (
                    <li key={seat.id} className={`seat${status.disabled ? ' is-disabled' : ''}`}>
                      <input
                        type="radio"
                        id={id}
                        name="seat"
                        value={seat.id}
                        className="seat__input"
                        checked={seatId === seat.id}
                        disabled={status.disabled}
                        aria-describedby={status.text ? `${id}-status` : undefined}
                        onChange={() => setSeatId(seat.id)}
                      />
                      <label htmlFor={id} className="seat__label">
                        <span className="seat__name">
                          {seat.name}
                          {seat.abbreviation ? (
                            <span className="seat__abbr"> ({seat.abbreviation})</span>
                          ) : null}
                        </span>
                        {seat.teamName || status.text ? (
                          <span className="seat__meta">
                            {seat.teamName ?? ''}
                            {seat.teamName && status.text ? ' · ' : ''}
                            {status.text ? <span id={`${id}-status`}>{status.text}</span> : null}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </fieldset>
          <div className="field">
            <label htmlFor="display-name" className="field__label">
              {STRINGS.join.displayName}
            </label>
            <input
              id="display-name"
              className="field__input"
              type="text"
              autoComplete="nickname"
              maxLength={40}
              value={name}
              aria-describedby="display-name-hint attribution"
              onChange={(e) => setName(e.target.value)}
            />
            <p id="display-name-hint" className="field__hint">
              {STRINGS.join.displayNameHint}
            </p>
          </div>
          <p id="attribution" className="join__attribution">
            {info.attribution === 'named'
              ? STRINGS.join.attributionNamed
              : STRINGS.join.attributionRole}
          </p>
          {joinError ? (
            <p className="join__error" role="alert">
              {STRINGS.join.rejected[joinError]}
            </p>
          ) : null}
          <button
            type="submit"
            className="btn btn--primary btn--block"
            disabled={!canJoin}
            aria-disabled={!canJoin}
          >
            {joining ? STRINGS.join.joining : STRINGS.join.join}
          </button>
          {connection !== 'connected' ? (
            <p className="join__note" role="status">
              {connection === 'offline' ? STRINGS.banner.offline : STRINGS.banner.reconnecting}
            </p>
          ) : null}
        </form>
      )}
      <footer className="join__foot">
        <p className="small">{STRINGS.link.doNotShare}</p>
        <p className="small">{STRINGS.join.version(bundleVersion, PROTOCOL_VERSION)}</p>
      </footer>
    </main>
  )
}

/** The seat a role hint names: a role id, or the first seat of the hinted kind. */
export function seatForHint(seats: Seat[], hint: string | undefined): Seat | undefined {
  if (!hint) return undefined
  const roleId = hintRole(hint)
  if (roleId) return seats.find((s) => s.id === roleId)
  return seats.find((s) => s.kind === hint)
}
