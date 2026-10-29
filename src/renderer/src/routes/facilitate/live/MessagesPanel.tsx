// The SimCell's inbox (#413): every role's conversation in one place, reply in character with
// the scenario's scripts beside the composer, mark handled, star, and pin to the hot wash.
import { useEffect, useMemo, useState } from 'react'
import { mediaUrl } from '@shared/media-url'
import type { LiveMessage, ThreadSummary } from '@shared/schemas/live'
import type { Scenario } from '@shared/schemas/scenario'
import { Button } from '../../../components/ui'
import { toast } from '../../../components/toast-store'
import { CannedReplies } from './CannedReplies'
import { MessageComposer } from './MessageComposer'
import { personaOptions, scriptFor, waitingLabel } from './messages-model'
import { PersonaPicker } from './PersonaPicker'
import { useLiveMessages, useThreadsQuery, type LiveMessages } from './use-live-messages'

function useNow(intervalMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

const clockTime = (at: number) =>
  new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function who(m: LiveMessage): string {
  return m.from.kind === 'client' ? m.from.seatLabel : m.from.persona
}

function ThreadButtons(props: {
  threads: ThreadSummary[]
  selected: string | undefined
  now: number
  onSelect: (channel: string) => void
}) {
  if (props.threads.length === 0) return <p className="fac-hint">No messages yet.</p>
  return (
    <ul className="fac-msg__threads" aria-label="Conversations">
      {props.threads.map((t) => (
        <li key={t.channel}>
          <button
            type="button"
            className="fac-msg__thread"
            aria-pressed={t.channel === props.selected}
            onClick={() => props.onSelect(t.channel)}
          >
            <span className="fac-msg__thread-name">
              {t.unread > 0 && <span aria-label={`${t.unread} unread`}>● </span>}
              {t.label}
            </span>
            <span className="fac-hint">
              {t.waitingSince !== undefined
                ? waitingLabel(t.waitingSince, props.now)
                : t.lastText.slice(0, 40)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function MessageRow(props: { m: LiveMessage; projectPath: string; live: LiveMessages }) {
  const { m, live } = props
  const run = (p: Promise<unknown>) => p.catch((e: Error) => toast.error(e.message))
  return (
    <article className="fac-msg__item">
      <p className="fac-msg__head">
        <strong>{who(m)}</strong> <span className="fac-hint">{m.exerciseTime}</span>{' '}
        <span className="fac-hint">({clockTime(m.at)})</span>
        {m.from.kind === 'controller' && <span className="fac-hint"> · you</span>}
      </p>
      <p className="fac-msg__text">{m.text}</p>
      {m.attachments.map((a) => (
        <img
          key={a.blobId}
          className="fac-msg__photo"
          src={mediaUrl(props.projectPath, a.path)}
          alt={`Photo from ${who(m)}`}
        />
      ))}
      <div className="row fac-msg__actions">
        <Button
          size="sm"
          aria-pressed={m.starred}
          onClick={() => run(live.star(m.messageId, !m.starred))}
        >
          {m.starred ? 'Starred' : 'Star'}
        </Button>
        <Button size="sm" disabled={m.pinned} onClick={() => run(live.pin(m.messageId))}>
          {m.pinned ? 'Pinned to hot wash' : 'Pin to hot wash'}
        </Button>
        {m.from.kind === 'client' && m.handledAt === undefined && (
          <Button size="sm" onClick={() => run(live.markHandled(m.messageId))}>
            Mark handled
          </Button>
        )}
        {m.handledAt !== undefined && <span className="fac-hint">Handled</span>}
      </div>
    </article>
  )
}

export function MessagesView(props: {
  projectPath: string
  scenario: Pick<Scenario, 'simcellScripts' | 'msel'>
  live: LiveMessages
  channel: string | undefined
  onChannel: (channel: string | undefined) => void
}) {
  const { live, channel } = props
  const now = useNow()
  const [personas, setPersonas] = useState<Record<string, string>>({})
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [playedBy, setPlayedBy] = useState(true)
  const [starred, setStarred] = useState(false)
  const [opened, setOpened] = useState<ThreadSummary[]>([])
  const threads = useMemo(
    () => [
      ...live.threads,
      ...opened.filter((o) => !live.threads.some((t) => t.channel === o.channel)),
    ],
    [live.threads, opened],
  )
  const current = threads.find((t) => t.channel === channel)
  const options = personaOptions(props.scenario)
  const persona = (channel && personas[channel]) ?? current?.lastPersona ?? 'SimCell'
  const shown = live.messages(channel).filter((m) => !starred || m.starred)

  if (!live.active)
    return <p className="fac-hint">Start a live session on the Live tab to message players.</p>

  const send = async () => {
    if (!channel || !text.trim() || !persona.trim()) return
    setBusy(true)
    try {
      await live.send({ channel, text, persona, showPlayedBy: playedBy })
      setText('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const start = async (target: string) => {
    if (!target) return
    try {
      const summary = await live.open(target)
      setOpened((o) => [...o.filter((x) => x.channel !== target), summary])
      props.onChannel(target)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="fac-msg">
      <aside className="fac-msg__side">
        <h3>Messages</h3>
        <ThreadButtons threads={threads} selected={channel} now={now} onSelect={props.onChannel} />
        <label htmlFor="fac-msg-new" className="field__label">
          Message a role, team or device
        </label>
        <select
          id="fac-msg-new"
          className="select"
          value=""
          onChange={(e) => void start(e.target.value)}
        >
          <option value="">Choose…</option>
          {live.targets.map((t) => (
            <option key={t.channel} value={t.channel}>
              {t.label}
            </option>
          ))}
        </select>
      </aside>
      <section className="fac-msg__main" aria-label="Conversation">
        {!channel ? (
          <p className="fac-hint">Pick a conversation, or start one with a role.</p>
        ) : (
          <>
            <h3>{current?.label ?? channel}</h3>
            <label className="fac-live__check">
              <input
                type="checkbox"
                checked={starred}
                onChange={(e) => setStarred(e.target.checked)}
              />
              Starred only
            </label>
            <div
              className="fac-msg__log"
              role="log"
              aria-live="polite"
              aria-label="Messages in this conversation"
            >
              {shown.length === 0 ? (
                <p className="fac-hint">No messages in this conversation yet.</p>
              ) : (
                shown.map((m) => (
                  <MessageRow key={m.messageId} m={m} projectPath={props.projectPath} live={live} />
                ))
              )}
            </div>
            <PersonaPicker
              options={options}
              value={persona}
              onChange={(p) => setPersonas((s) => ({ ...s, [channel]: p }))}
            />
            <label className="fac-live__check">
              <input
                type="checkbox"
                checked={playedBy}
                onChange={(e) => setPlayedBy(e.target.checked)}
              />
              Show “played by SimCell” on players’ devices
            </label>
            <CannedReplies
              script={scriptFor(props.scenario, persona)}
              onInsert={(t) => setText((cur) => (cur ? `${cur}\n${t}` : t))}
            />
            <MessageComposer
              value={text}
              onChange={setText}
              onSend={() => void send()}
              persona={persona}
              disabled={!text.trim() || !persona.trim()}
              busy={busy}
            />
          </>
        )}
      </section>
    </div>
  )
}

export function MessagesPanel(props: { projectPath: string; scenario: Scenario }) {
  const [channel, setChannel] = useState<string>()
  const live = useLiveMessages(props.projectPath, props.scenario.id, channel)
  return (
    <MessagesView
      projectPath={props.projectPath}
      scenario={props.scenario}
      live={live}
      channel={channel}
      onChannel={setChannel}
    />
  )
}

/** The tab's name, with how many conversations are waiting for an answer. */
export function MessagesTabLabel(props: { projectPath: string; scenarioId: string }) {
  const { threads } = useThreadsQuery(props.projectPath, props.scenarioId)
  const waiting = threads.filter((t) => t.waitingSince !== undefined).length
  return (
    <>
      Messages
      {waiting > 0 && (
        <span className="fac-tabs__badge" aria-label={`, ${waiting} waiting`}>
          {waiting}
        </span>
      )}
    </>
  )
}
