// The SimCell assistant on the Facilitate page (spec 0429). With a live session: the approval
// queue of drafted replies, the model check, and calls. Without one: type what a player asked on
// the phone and get a reply to read aloud in character. A person approves everything.
import { useEffect, useMemo, useState } from 'react'
import type { Scenario } from '@shared/schemas/scenario'
import type { SimcellDraft } from '@shared/schemas/persona'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { CapabilityStatus } from './CapabilityStatus'
import { DraftEditor } from './DraftEditor'
import { ageLabel, byAge, senderLabel } from './simcell-model'
import { useSimcellQueue } from './use-simcell-queue'

function useNow(intervalMs = 20_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function SimcellPanel(props: { projectPath: string; scenario: Pick<Scenario, 'id'> }) {
  const { projectPath } = props
  const scenarioId = props.scenario.id
  const q = useSimcellQueue(projectPath, scenarioId)
  const now = useNow()
  const [selected, setSelected] = useState<string>()
  const [offline, setOffline] = useState<SimcellDraft>()
  const [personaId, setPersonaId] = useState('')
  const [playerText, setPlayerText] = useState('')
  const [busy, setBusy] = useState(false)
  const targets = useIpcQuery('live:message-targets', q.req, { enabled: !!q.status?.live })
  const live = !!q.status?.live
  const drafts = useMemo(() => byAge(q.drafts), [q.drafts])
  const current = drafts.find((d) => d.id === selected) ?? drafts[0]
  const cardOf = (id: string) => q.cards.find((c) => c.id === id)
  const chosen = personaId || q.cards[0]?.id || ''
  const base = q.req

  if (q.loading) return <p className="fac-hint">Loading…</p>
  if (q.cards.length === 0)
    return (
      <div className="fac-simcell">
        <h3>SimCell assistant</h3>
        <p className="fac-hint">
          No persona cards yet. Open the scenario and use its Personas tab to create them from the
          SimCell scripts.
        </p>
      </div>
    )

  const toggle = async (enabled: boolean) => {
    try {
      await call('simcell:set-options', { ...base, enabled })
    } catch (e) {
      toast.error('Drafting stays off', e)
    }
    void queryClient.invalidateQueries({ queryKey: ['simcell:queue'] })
  }
  const draftFor = async (threadId: string, persona: string) => {
    setBusy(true)
    try {
      const d = await call('simcell:draft', { ...base, personaId: persona, threadId })
      setSelected(d.id)
      void queryClient.invalidateQueries({ queryKey: ['simcell:queue'] })
    } catch (e) {
      toast.error('Could not draft a reply', e)
    } finally {
      setBusy(false)
    }
  }
  const askOffline = async () => {
    if (!chosen || !playerText.trim()) return
    setBusy(true)
    try {
      setOffline(await call('simcell:offline-turn', { ...base, personaId: chosen, playerText }))
    } catch (e) {
      toast.error('Could not draft a reply', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fac-simcell">
      <h3>SimCell assistant</h3>
      <p className="fac-hint">
        Drafts are for you only. Nothing reaches a player until you send it.
      </p>
      <CapabilityStatus projectPath={projectPath} />
      {live ? (
        <>
          <label className="fac-live__check">
            <input
              type="checkbox"
              checked={!!q.status?.enabled}
              onChange={(e) => void toggle(e.target.checked)}
            />
            Draft replies when players write
          </label>
          <h4>Waiting for your approval ({drafts.length})</h4>
          {drafts.length === 0 ? (
            <p className="fac-hint">No drafts waiting.</p>
          ) : (
            <ul className="fac-simcell__queue" aria-label="Drafts waiting">
              {drafts.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="fac-msg__thread"
                    aria-pressed={d.id === current?.id}
                    onClick={() => setSelected(d.id)}
                  >
                    <span className="fac-msg__thread-name">
                      {cardOf(d.personaId)?.displayName ?? d.personaId}
                    </span>
                    <span className="fac-hint">
                      {ageLabel(d.createdAt, now)}
                      {d.flags.length > 0 &&
                        ` · ${d.flags.length} check${d.flags.length === 1 ? '' : 's'}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {current && (
            <DraftEditor
              key={current.id}
              projectPath={projectPath}
              scenarioId={scenarioId}
              draft={current}
              card={cardOf(current.personaId)}
              targets={targets.data ?? []}
              live
              onDone={() => setSelected(undefined)}
            />
          )}
          {q.waiting.length > 0 && (
            <>
              <h4>Messages without a draft</h4>
              <ul className="fac-simcell__waiting" aria-label="Messages without a draft">
                {q.waiting.map((w) => (
                  <WaitingRow
                    key={w.threadId}
                    w={w}
                    now={now}
                    cards={q.cards}
                    busy={busy}
                    onDraft={(persona) => void draftFor(w.threadId, persona)}
                    onAssign={(persona) =>
                      void call('simcell:assign', {
                        ...base,
                        threadId: w.threadId,
                        personaId: persona,
                      })
                    }
                  />
                ))}
              </ul>
            </>
          )}
          <StartCall
            projectPath={projectPath}
            scenarioId={scenarioId}
            cards={q.cards}
            targets={targets.data ?? []}
          />
        </>
      ) : (
        <>
          <h4>Practice or a phone call</h4>
          <p className="fac-hint">
            Choose who the players are talking to, type what they said, and read the reply aloud.
          </p>
          <label htmlFor="simcell-persona" className="field__label">
            Who is speaking
          </label>
          <select
            id="simcell-persona"
            className="select"
            value={chosen}
            onChange={(e) => setPersonaId(e.target.value)}
          >
            {q.cards.map((c) => (
              <option key={c.id} value={c.id}>
                {senderLabel(c)}
              </option>
            ))}
          </select>
          <label htmlFor="simcell-player-text" className="field__label">
            What the player said
          </label>
          <textarea
            id="simcell-player-text"
            className="input"
            rows={3}
            maxLength={4000}
            value={playerText}
            onChange={(e) => setPlayerText(e.target.value)}
          />
          <Button
            variant="primary"
            disabled={busy || !playerText.trim()}
            onClick={() => void askOffline()}
          >
            Draft a reply
          </Button>
          {offline && (
            <DraftEditor
              key={offline.id}
              projectPath={projectPath}
              scenarioId={scenarioId}
              draft={offline}
              card={cardOf(offline.personaId)}
              targets={[]}
              live={false}
              onDone={() => {
                setOffline(undefined)
                setPlayerText('')
                toast.success('Saved with the hot wash notes')
              }}
            />
          )}
        </>
      )}
      <div role="status" aria-live="polite" className="sr-only">
        {q.announcement}
      </div>
    </div>
  )
}

function WaitingRow(props: {
  w: { threadId: string; label: string; text: string; at: number; personaId?: string | undefined }
  now: number
  cards: { id: string; displayName: string }[]
  busy: boolean
  onDraft: (personaId: string) => void
  onAssign: (personaId: string) => void
}) {
  const { w } = props
  const [persona, setPersona] = useState(w.personaId ?? '')
  return (
    <li className="fac-simcell__waiting-row">
      <p>
        <strong>{w.label}</strong>{' '}
        <span className="fac-hint">waiting {ageLabel(w.at, props.now)}</span>
      </p>
      <p className="fac-msg__text">{w.text}</p>
      <label htmlFor={`wait-${w.threadId}`} className="sr-only">
        Persona for {w.label}
      </label>
      <select
        id={`wait-${w.threadId}`}
        className="select"
        value={persona}
        onChange={(e) => {
          setPersona(e.target.value)
          if (e.target.value) props.onAssign(e.target.value)
        }}
      >
        <option value="">Choose a persona…</option>
        {props.cards.map((c) => (
          <option key={c.id} value={c.id}>
            {c.displayName}
          </option>
        ))}
      </select>
      <Button size="sm" disabled={props.busy || !persona} onClick={() => props.onDraft(persona)}>
        Draft a reply
      </Button>
    </li>
  )
}

function StartCall(props: {
  projectPath: string
  scenarioId: string
  cards: { id: string; displayName: string }[]
  targets: { channel: string; label: string }[]
}) {
  const [personaId, setPersonaId] = useState('')
  const [threadId, setThreadId] = useState('')
  const [text, setText] = useState('')
  const [calls, setCalls] = useState<{ callId: string; label: string }[]>([])
  const base = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const ring = async () => {
    try {
      const r = await call('simcell:call-start', {
        ...base,
        personaId: personaId || props.cards[0]!.id,
        threadId,
        text,
      })
      const label = props.targets.find((t) => t.channel === threadId)?.label ?? threadId
      setCalls((c) => [...c, { callId: r.callId, label }])
      setText('')
      toast.success('The call is ringing')
    } catch (e) {
      toast.error('Could not start the call', e)
    }
  }
  return (
    <details className="fac-simcell__call">
      <summary>Start a call</summary>
      <label htmlFor="simcell-call-persona" className="field__label">
        Caller
      </label>
      <select
        id="simcell-call-persona"
        className="select"
        value={personaId || props.cards[0]?.id}
        onChange={(e) => setPersonaId(e.target.value)}
      >
        {props.cards.map((c) => (
          <option key={c.id} value={c.id}>
            {c.displayName}
          </option>
        ))}
      </select>
      <label htmlFor="simcell-call-to" className="field__label">
        Ring
      </label>
      <select
        id="simcell-call-to"
        className="select"
        value={threadId}
        onChange={(e) => setThreadId(e.target.value)}
      >
        <option value="">Choose a role, team or device…</option>
        {props.targets.map((t) => (
          <option key={t.channel} value={t.channel}>
            {t.label}
          </option>
        ))}
      </select>
      <label htmlFor="simcell-call-text" className="field__label">
        Opening line
      </label>
      <textarea
        id="simcell-call-text"
        className="input"
        rows={3}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button variant="primary" disabled={!threadId || !text.trim()} onClick={() => void ring()}>
        Ring now
      </Button>
      {calls.length > 0 && (
        <ul aria-label="Calls you started">
          {calls.map((c) => (
            <li key={c.callId}>
              {c.label}{' '}
              <Button
                size="sm"
                onClick={() =>
                  void call('simcell:call-end', { ...base, callId: c.callId })
                    .then(() => setCalls((all) => all.filter((x) => x.callId !== c.callId)))
                    .catch((e: unknown) => toast.error('Could not end the call', e))
                }
              >
                End call
              </Button>
            </li>
          ))}
        </ul>
      )}
    </details>
  )
}
