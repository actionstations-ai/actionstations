import { useEffect, useRef, useState } from 'react'
import type { PlayerSession } from '../../app/session'
import { useStore } from '../../app/store'
import { STRINGS } from '../../app/strings'
import {
  boardRows,
  canWithdraw,
  shownCount,
  waitingOwn,
  type BoardEntry,
  type BoardRow,
} from './hotwash'

const T = STRINGS.hotwash

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

/** One polite note for a burst of arrivals ("3 new items"), not one announcement per item. */
function useNewItemsNote(count: number): string {
  const seen = useRef(count)
  const [note, setNote] = useState('')
  useEffect(() => {
    if (count <= seen.current) {
      seen.current = count
      return
    }
    const id = setTimeout(() => {
      setNote(T.newItems(count - seen.current))
      seen.current = count
    }, 1200)
    return () => clearTimeout(id)
  }, [count])
  return note
}

function Who({ entry, roleName }: { entry: BoardEntry; roleName: (id: string) => string }) {
  const parts = [
    entry.mine ? T.yours : undefined,
    entry.roleId ? roleName(entry.roleId) : T.anonymous,
  ].filter(Boolean)
  return <span className="hw-item__who">{parts.join(' · ')}</span>
}

interface Ctx {
  now: number
  roleName: (id: string) => string
  session: PlayerSession
}

function Entry({ entry, ctx }: { entry: BoardEntry; ctx: Ctx }) {
  const { session } = ctx
  const canPlus = !entry.mine && !entry.plusMine
  return (
    <li className="hw-item" data-mine={entry.mine || undefined}>
      <div className="hw-item__body">
        <p className="hw-item__text">{entry.text}</p>
        <p className="hw-item__meta">
          <span className="hw-item__kind">{T.kinds[entry.kind]}</span>
          <Who entry={entry} roleName={ctx.roleName} />
          {entry.promoted ? <span className="hw-item__mark">★ {T.promoted}</span> : null}
        </p>
      </div>
      <div className="hw-item__actions">
        <button
          type="button"
          className="btn btn--small"
          aria-pressed={entry.plusMine}
          aria-disabled={canPlus ? undefined : 'true'}
          aria-label={entry.plusMine ? T.plusDone(entry.plus) : T.plusOne(entry.plus)}
          onClick={() => canPlus && void session.plusHotwash(entry.itemId)}
        >
          <span aria-hidden="true">▲ {entry.plus}</span>
        </button>
        {canWithdraw(entry, ctx.now) ? (
          <button
            type="button"
            className="btn btn--quiet btn--small"
            onClick={() => void session.withdrawHotwash(entry.itemId)}
          >
            {T.withdraw}
          </button>
        ) : null}
      </div>
    </li>
  )
}

function Row({ row, ctx }: { row: BoardRow; ctx: Ctx }) {
  if (row.type === 'item') return <Entry entry={row.entry} ctx={ctx} />
  return (
    <li className="hw-group">
      <p className="hw-group__title">
        {T.group(row.label, row.entries.length)}
        {row.promoted ? <span className="hw-item__mark"> ★ {T.promoted}</span> : null}
      </p>
      <ul className="hw-list">
        {row.entries.map((e) => (
          <Entry key={e.itemId} entry={e} ctx={ctx} />
        ))}
      </ul>
    </li>
  )
}

/** The shared board, most +1s first, and this device's items still waiting to appear on it. */
export function BoardList({ session }: { session: PlayerSession }) {
  const hotwash = useStore(session.store, (s) => s.hotwash)
  const seats = useStore(session.store, (s) => s.info?.seats ?? [])
  const now = useNow(15_000)
  const note = useNewItemsNote(shownCount(hotwash))
  const roleName = (id: string) => seats.find((s) => s.id === id)?.name ?? id
  const rows = boardRows(hotwash)
  const waiting = waitingOwn(hotwash)
  return (
    <section className="hw-board" aria-labelledby="hw-board-heading">
      <h2 id="hw-board-heading">{T.boardHeading(shownCount(hotwash))}</h2>
      <p className="sr-only" role="status">
        {note}
      </p>
      {waiting.length > 0 ? (
        <div className="hw-waiting">
          <h3>{T.waitingHeading}</h3>
          <ul className="hw-list">
            {waiting.map((e) => (
              <li key={e.itemId} className="hw-item" data-mine>
                <div className="hw-item__body">
                  <p className="hw-item__text">{e.text}</p>
                  <p className="hw-item__meta">{T.waiting}</p>
                </div>
                {canWithdraw(e, now) ? (
                  <button
                    type="button"
                    className="btn btn--quiet btn--small"
                    onClick={() => void session.withdrawHotwash(e.itemId)}
                  >
                    {T.withdraw}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="muted">{T.boardEmpty}</p>
      ) : (
        <ul className="hw-list">
          {rows.map((row) => (
            <Row
              key={row.type === 'group' ? `g:${row.groupId}` : row.entry.itemId}
              row={row}
              ctx={{ now, roleName, session }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
