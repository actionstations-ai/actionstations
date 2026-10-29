// One SimCell draft awaiting a person (spec 0429 FR-7, FR-10, FR-11, FR-13): the text, which
// goal, deadline or rule it applied, the checks that flagged it as text, and the five actions.
// Nothing here sends on its own; every path ends in a button press or a shortcut.
import { useRef, useState, type KeyboardEvent } from 'react'
import { mediaUrl } from '@shared/media-url'
import type { MessageTarget } from '@shared/schemas/live'
import type { PersonaCard, SimcellDraft } from '@shared/schemas/persona'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { appliedChips, FLAG_TITLES, senderLabel } from './simcell-model'

interface Props {
  projectPath: string
  scenarioId: string
  draft: SimcellDraft
  card: PersonaCard | undefined
  /** Where a draft with no thread can go. */
  targets: MessageTarget[]
  live: boolean
  onDone: () => void
}

const SHORTCUTS = 'Ctrl+Enter send, Alt+R regenerate, Alt+W write my own, Alt+D discard'

export function DraftEditor(props: Props) {
  const { draft, card, live } = props
  const offline = draft.threadId === 'offline'
  const [text, setText] = useState(draft.text)
  const [own, setOwn] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [asCall, setAsCall] = useState(false)
  const [channel, setChannel] = useState('')
  const [busy, setBusy] = useState(false)
  const [voiceUrl, setVoiceUrl] = useState<string>()
  const field = useRef<HTMLTextAreaElement>(null)
  const base = { projectPath: props.projectPath, scenarioId: props.scenarioId }
  const edited = text.trim() !== draft.text.trim()
  const needsChannel = draft.threadId === 'unassigned'

  const run = async (work: () => Promise<unknown>, title: string) => {
    setBusy(true)
    try {
      await work()
      void queryClient.invalidateQueries({ queryKey: ['simcell:queue'] })
      props.onDone()
    } catch (e) {
      toast.error(title, e)
    } finally {
      setBusy(false)
    }
  }

  const resolve = (action: 'send' | 'edit' | 'rewrite' | 'discard') =>
    run(
      () =>
        call('simcell:resolve', {
          ...base,
          draftId: draft.id,
          action,
          ...(action === 'edit' || action === 'rewrite' ? { text } : {}),
          ...(needsChannel && channel ? { channel } : {}),
          ...(asCall && live ? { asCall: true } : {}),
        }),
      action === 'discard' ? 'Could not discard the draft' : 'Could not send the reply',
    )

  const send = () => {
    if (busy || !text.trim()) return
    void resolve(own ? 'rewrite' : edited ? 'edit' : 'send')
  }
  const regenerate = () =>
    run(
      () =>
        call('simcell:draft', {
          ...base,
          personaId: draft.personaId,
          threadId: draft.threadId,
          replaces: draft.id,
          ...(instruction.trim() ? { instruction: instruction.trim() } : {}),
        }),
      'Could not draft again',
    )
  const writeOwn = () => {
    setOwn(true)
    setText('')
    field.current?.focus()
  }
  const speak = async () => {
    try {
      const r = await call('simcell:voice-render', {
        ...base,
        personaId: draft.personaId,
        text: text.trim(),
      })
      setVoiceUrl(mediaUrl(props.projectPath, r.assetPath))
    } catch (e) {
      toast.error('Could not make the voice', e)
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      send()
    } else if (e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault()
      void regenerate()
    } else if (e.altKey && e.key.toLowerCase() === 'w') {
      e.preventDefault()
      writeOwn()
    } else if (e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault()
      void resolve('discard')
    }
  }

  return (
    <section className="fac-simcell__draft" aria-label="Draft reply" onKeyDown={onKey}>
      <h4>
        {card ? senderLabel(card) : draft.personaId}
        {offline ? '' : ` · ${draft.trigger.replace('_', ' ')}`}
      </h4>
      {draft.inReplyToText && (
        <blockquote className="fac-simcell__quote">
          <span className="fac-hint">The players wrote:</span> {draft.inReplyToText}
        </blockquote>
      )}
      {draft.controllerNote && <p className="fac-hint">Note: {draft.controllerNote}</p>}
      {draft.flags.length > 0 && (
        <ul className="fac-simcell__flags" aria-label="Checks on this draft">
          {draft.flags.map((f, i) => (
            <li key={i}>
              <strong>Check: {FLAG_TITLES[f.code]}.</strong> {f.message}
            </li>
          ))}
        </ul>
      )}
      <ul className="fac-simcell__chips" aria-label="What the draft applied">
        <li>Intent: {draft.intent}</li>
        {appliedChips(draft, card).map((c) => (
          <li key={`${c.kind}${c.id}`}>
            {c.kind}: {c.text}
          </li>
        ))}
        {draft.concessionEvidence && (
          <li>Players met the condition with: {draft.concessionEvidence}</li>
        )}
      </ul>
      <label htmlFor={`draft-text-${draft.id}`} className="field__label">
        {own ? 'Your own reply' : 'Reply'}
      </label>
      <textarea
        id={`draft-text-${draft.id}`}
        ref={field}
        className="input fac-simcell__text"
        rows={5}
        maxLength={2000}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {needsChannel && (
        <>
          <label htmlFor={`draft-to-${draft.id}`} className="field__label">
            Send to
          </label>
          <select
            id={`draft-to-${draft.id}`}
            className="select"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">Choose who receives this…</option>
            {props.targets.map((t) => (
              <option key={t.channel} value={t.channel}>
                {t.label}
              </option>
            ))}
          </select>
        </>
      )}
      {live && !offline && (
        <label className="fac-live__check">
          <input type="checkbox" checked={asCall} onChange={(e) => setAsCall(e.target.checked)} />
          Ring the players with this reply as a call
        </label>
      )}
      <div className="row fac-simcell__actions">
        <Button
          variant="primary"
          disabled={busy || !text.trim() || (needsChannel && !channel)}
          aria-keyshortcuts="Control+Enter"
          onClick={send}
        >
          {offline ? 'Use this reply' : own ? 'Send my own' : edited ? 'Edit and send' : 'Send'}
        </Button>
        <Button disabled={busy} aria-keyshortcuts="Alt+W" onClick={writeOwn}>
          Write my own
        </Button>
        <Button disabled={busy} aria-keyshortcuts="Alt+D" onClick={() => void resolve('discard')}>
          Discard
        </Button>
        {(offline || asCall) && (
          <Button disabled={busy || !text.trim()} onClick={() => void speak()}>
            Play as voice
          </Button>
        )}
      </div>
      <div className="row fac-simcell__regen">
        <label htmlFor={`draft-instr-${draft.id}`} className="sr-only">
          Instruction for the next draft
        </label>
        <input
          id={`draft-instr-${draft.id}`}
          className="input"
          maxLength={300}
          placeholder="Optional: be more hostile, the deadline passed"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <Button disabled={busy} aria-keyshortcuts="Alt+R" onClick={() => void regenerate()}>
          Regenerate
        </Button>
      </div>
      {voiceUrl && <audio controls src={voiceUrl} aria-label="Reply as voice" />}
      <p className="fac-hint">Shortcuts: {SHORTCUTS}.</p>
    </section>
  )
}
