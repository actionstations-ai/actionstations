// Hot wash transcript editor (#425 FR-10, FR-11): segments with recording time and wall clock,
// play a segment, correct its text, set the speaker, mark quotes for the AAR and link them to
// objectives, MSEL rows and a Core Capability, merge or split segments, redact. Works without a
// mouse: every action is a labelled button or field in reading order.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft, Play } from 'lucide-react'
import { capabilityName } from '@shared/core-capabilities'
import { hhmm, recordingClock, wallTimeAt } from '@shared/hotwash-time'
import { mediaUrl } from '@shared/media-url'
import type { HotwashRecording, Transcript, TranscriptSegment } from '@shared/schemas/hotwash'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, Button, Dialog, PageHeader } from '../../components/ui'
import { newClientId } from './ids'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import {
  canMerge,
  filterSegments,
  isEdited,
  mergeWithNext,
  parseRowIds,
  setQuoteLinks,
  setQuoted,
  setSpeaker,
  setText,
  splitAt,
  type SegmentFilter,
} from './transcript-edit'
import { useTranscriptDraft, type DraftStatus } from './use-transcript-draft'
import './hotwash.css'

type Edit = (fn: (t: Transcript) => Transcript) => void

const STATUS_TEXT: Record<DraftStatus, string> = {
  idle: '',
  pending: 'Unsaved changes…',
  saving: 'Saving…',
  saved: 'Saved',
  conflict: 'Not saved: the transcript changed since you opened it.',
  error: 'Not saved.',
}

/** Where each page audio element should stop (a segment's end). */
const stopAt = new WeakMap<HTMLAudioElement, number>()

function onTimeUpdate(e: { currentTarget: HTMLAudioElement }): void {
  const el = e.currentTarget
  const end = stopAt.get(el)
  if (end !== undefined && el.currentTime >= end) {
    el.pause()
    stopAt.delete(el)
  }
}

const AUDIO_ID = 'hw-transcript-audio'

/** The page's one <audio>: a segment plays from its start and pauses at its end. */
function playSegment(s: TranscriptSegment): void {
  const el = document.getElementById(AUDIO_ID)
  if (!(el instanceof HTMLAudioElement)) return
  el.currentTime = s.startSec
  stopAt.set(el, s.endSec)
  void el.play().catch(() => undefined)
}

interface RowCtx {
  scenario: Scenario | undefined
  recording: HotwashRecording
  edit: Edit
  readOnly: boolean
  canPlay: boolean
  onPlay: (s: TranscriptSegment) => void
  onRedact: (s: TranscriptSegment) => void
  transcript: Transcript
}

function SpeakerField({ s, ctx }: { s: TranscriptSegment; ctx: RowCtx }) {
  const id = useId()
  const listId = useId()
  const roles = ctx.scenario?.roles ?? []
  const [value, setValue] = useState(s.speaker?.label ?? '')
  const commit = () => {
    if (value.trim() === (s.speaker?.label ?? '')) return
    const role = roles.find((r) => r.name === value.trim())
    ctx.edit((t) => setSpeaker(t, s.id, { label: value, ...(role ? { roleId: role.id } : {}) }))
  }
  return (
    <span className="hw-seg__speaker">
      <label htmlFor={id} className="sr-only">
        Speaker at {recordingClock(s.startSec)}
      </label>
      <input
        id={id}
        className="input input--sm"
        list={listId}
        placeholder="Speaker"
        value={value}
        disabled={ctx.readOnly || s.redacted}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      <datalist id={listId}>
        {roles.map((r) => (
          <option key={r.id} value={r.name} />
        ))}
      </datalist>
    </span>
  )
}

function QuoteLinks({ s, ctx }: { s: TranscriptSegment; ctx: RowCtx }) {
  const objId = useId()
  const rowsId = useId()
  const capId = useId()
  const quote = s.quote!
  const objectives = ctx.scenario?.objectives ?? []
  const capabilities = ctx.scenario?.evaluation?.eegs.map((e) => e.capability) ?? []
  const [rows, setRows] = useState(quote.rowIds.join(', '))
  const set = (patch: Parameters<typeof setQuoteLinks>[2]) =>
    ctx.edit((t) => setQuoteLinks(t, s.id, patch))
  return (
    <div className="hw-seg__links">
      <label htmlFor={objId}>Objective</label>
      <select
        id={objId}
        className="input input--sm"
        value={quote.objectiveIds[0] ?? ''}
        disabled={ctx.readOnly}
        onChange={(e) => set({ objectiveIds: e.target.value ? [e.target.value] : [] })}
      >
        <option value="">None</option>
        {objectives.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name || o.text.slice(0, 60)}
          </option>
        ))}
      </select>
      <label htmlFor={rowsId}>MSEL rows</label>
      <input
        id={rowsId}
        className="input input--sm"
        placeholder="I-07, I-09"
        value={rows}
        disabled={ctx.readOnly}
        onChange={(e) => setRows(e.target.value)}
        onBlur={() => set({ rowIds: parseRowIds(rows) })}
      />
      {capabilities.length > 0 && (
        <>
          <label htmlFor={capId}>Core Capability</label>
          <select
            id={capId}
            className="input input--sm"
            value={quote.capability ?? ''}
            disabled={ctx.readOnly}
            onChange={(e) => set({ capability: e.target.value })}
          >
            <option value="">None</option>
            {capabilities.map((c) => (
              <option key={c} value={c}>
                {capabilityName(c)}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  )
}

function SegmentText({
  s,
  ctx,
  editing,
  setEditing,
}: {
  s: TranscriptSegment
  ctx: RowCtx
  editing: boolean
  setEditing: (on: boolean) => void
}) {
  const id = useId()
  const area = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(s.text)
  useEffect(() => {
    if (editing) area.current?.focus()
  }, [editing])
  if (!editing)
    return <p className={s.redacted ? 'hw-seg__text muted' : 'hw-seg__text'}>{s.text}</p>
  const done = () => {
    if (value !== s.text) ctx.edit((t) => setText(t, s.id, value))
    setEditing(false)
  }
  const split = () => {
    const at = area.current?.selectionStart ?? 0
    ctx.edit((t) => splitAt(setText(t, s.id, value), s.id, at, newClientId()))
    setEditing(false)
  }
  return (
    <div className="hw-seg__edit">
      <label htmlFor={id} className="sr-only">
        Text at {recordingClock(s.startSec)}
      </label>
      <textarea
        id={id}
        ref={area}
        className="input"
        rows={3}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false)
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) done()
        }}
      />
      <div className="row">
        <Button size="sm" variant="primary" onClick={done}>
          Done
        </Button>
        <Button size="sm" onClick={split}>
          Split at cursor
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {s.originalText && s.originalText !== value && (
        <p className="muted">Model wrote: “{s.originalText}”</p>
      )}
    </div>
  )
}

function SegmentRow({ s, ctx }: { s: TranscriptSegment; ctx: RowCtx }) {
  const [editing, setEditing] = useState(false)
  const at = recordingClock(s.startSec)
  const wall = wallTimeAt(ctx.recording, s.startSec)
  const quoteId = useId()
  return (
    <li className="hw-seg" data-quote={s.quote ? 'yes' : 'no'}>
      <div className="hw-seg__meta">
        {ctx.canPlay && !s.redacted ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => ctx.onPlay(s)}
            aria-label={`Play from ${at}`}
          >
            <Play size={12} aria-hidden /> <span className="mono">{at}</span>
          </Button>
        ) : (
          <span className="mono">{at}</span>
        )}
        {wall && <span className="muted mono">{hhmm(wall)}</span>}
        <SpeakerField key={s.speaker?.label ?? ''} s={s} ctx={ctx} />
        {s.quote && <Badge tone="info">Quote</Badge>}
        {isEdited(s) && <Badge>Edited</Badge>}
        {s.redacted && <Badge tone="warn">Redacted</Badge>}
      </div>
      <SegmentText key={s.text} s={s} ctx={ctx} editing={editing} setEditing={setEditing} />
      {!s.redacted && !ctx.readOnly && !editing && (
        <div className="row hw-seg__actions">
          <label className="row" htmlFor={quoteId}>
            <input
              id={quoteId}
              type="checkbox"
              checked={!!s.quote}
              onChange={(e) => ctx.edit((t) => setQuoted(t, s.id, e.target.checked))}
            />
            Quote for the AAR
          </label>
          <Button size="sm" onClick={() => setEditing(true)} aria-label={`Edit text at ${at}`}>
            Edit
          </Button>
          <Button
            size="sm"
            disabled={!canMerge(ctx.transcript, s.id)}
            onClick={() => ctx.edit((t) => mergeWithNext(t, s.id))}
            aria-label={`Merge ${at} with the next segment`}
          >
            Merge with next
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => ctx.onRedact(s)}
            aria-label={`Redact ${at}`}
          >
            Redact
          </Button>
        </div>
      )}
      {s.quote && !s.redacted && <QuoteLinks key={s.quote.rowIds.join(',')} s={s} ctx={ctx} />}
    </li>
  )
}

function FilterBar(props: {
  filter: SegmentFilter
  onFilter: (f: SegmentFilter) => void
  search: string
  onSearch: (s: string) => void
  counts: Record<SegmentFilter, number>
}) {
  const searchId = useId()
  const options: [SegmentFilter, string][] = [
    ['all', 'All'],
    ['quotes', 'Quotes'],
    ['edited', 'Edited'],
  ]
  return (
    <div className="row hw-filter">
      <fieldset className="hw-filter__group">
        <legend className="sr-only">Show</legend>
        {options.map(([value, label]) => (
          <label key={value} className="row">
            <input
              type="radio"
              name="hw-filter"
              checked={props.filter === value}
              onChange={() => props.onFilter(value)}
            />
            {label} ({props.counts[value]})
          </label>
        ))}
      </fieldset>
      <label htmlFor={searchId}>Search</label>
      <input
        id={searchId}
        type="search"
        className="input input--sm"
        value={props.search}
        onChange={(e) => props.onSearch(e.target.value)}
      />
    </div>
  )
}

function RedactDialog(props: {
  segment: TranscriptSegment | undefined
  onClose: () => void
  onConfirm: (s: TranscriptSegment) => void
}) {
  const s = props.segment
  return (
    <Dialog
      open={!!s}
      onOpenChange={(open) => !open && props.onClose()}
      title="Redact this segment?"
      description="Its text is replaced with [redacted] in the transcript and the AAR, and its quote mark is removed. This cannot be undone. The audio, if kept, is not changed."
      footer={
        <>
          <Button onClick={props.onClose}>Keep</Button>
          <Button variant="danger" onClick={() => s && props.onConfirm(s)}>
            Redact
          </Button>
        </>
      }
    >
      {s && <p className="hw-seg__text">{s.text}</p>}
    </Dialog>
  )
}

function useEditorView(t: Transcript) {
  const [filter, setFilter] = useState<SegmentFilter>('all')
  const [search, setSearch] = useState('')
  const counts = useMemo(
    () => ({
      all: t.segments.length,
      quotes: t.segments.filter((s) => s.quote).length,
      edited: t.segments.filter(isEdited).length,
    }),
    [t.segments],
  )
  const shown = useMemo(
    () => filterSegments(t.segments, filter, search),
    [t.segments, filter, search],
  )
  return { filter, setFilter, search, setSearch, counts, shown }
}

function Editor(props: {
  projectPath: string
  scenario: Scenario | undefined
  recording: HotwashRecording
  draft: ReturnType<typeof useTranscriptDraft>
  transcript: Transcript
}) {
  const { recording, draft, transcript } = props
  const src = recording.audioPath ? mediaUrl(props.projectPath, recording.audioPath) : undefined
  const view = useEditorView(transcript)
  const [redacting, setRedacting] = useState<TranscriptSegment | undefined>(undefined)
  const readOnly = recording.status === 'transcribing'
  const ctx: RowCtx = {
    scenario: props.scenario,
    recording,
    edit: draft.edit,
    readOnly,
    canPlay: !!src,
    onPlay: playSegment,
    onRedact: setRedacting,
    transcript,
  }
  return (
    <>
      {src && <audio id={AUDIO_ID} src={src} preload="metadata" onTimeUpdate={onTimeUpdate} />}
      <p className="hw-status" role="status" aria-live="polite">
        {readOnly
          ? 'Transcription is still running; editing opens when it finishes.'
          : STATUS_TEXT[draft.status]}
        {draft.status === 'conflict' && (
          <Button size="sm" onClick={() => void draft.reload()}>
            Reload
          </Button>
        )}
        {draft.status === 'error' && <span className="field__error"> {draft.error}</span>}
      </p>
      <FilterBar
        filter={view.filter}
        onFilter={view.setFilter}
        search={view.search}
        onSearch={view.setSearch}
        counts={view.counts}
      />
      {view.shown.length === 0 ? (
        <p className="muted">No segments match.</p>
      ) : (
        <ol className="hw-segments" aria-label="Transcript segments">
          {view.shown.map((s) => (
            <SegmentRow key={s.id} s={s} ctx={ctx} />
          ))}
        </ol>
      )}
      <RedactDialog
        segment={redacting}
        onClose={() => setRedacting(undefined)}
        onConfirm={(s) => {
          setRedacting(undefined)
          void draft.redact(s.id)
        }}
      />
    </>
  )
}

export default function TranscriptPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const recordingId = params.recordingId ?? ''
  const scenarioQ = useIpcQuery('scenarios:get', { projectPath, scenarioId })
  const draft = useTranscriptDraft(projectPath, scenarioId, recordingId)
  const back = (
    <Link
      to={`/p/${projectKey(projectPath)}/scenarios/${scenarioId}/facilitate`}
      className="fac-back"
    >
      <ArrowLeft size={14} aria-hidden /> Back to Facilitate
    </Link>
  )
  const rec = draft.recording
  const t = draft.draft
  if (draft.loadError)
    return (
      <div className="page">
        {back}
        <p className="field__error" role="alert">
          Could not load the transcript: {draft.loadError}
        </p>
      </div>
    )
  if (draft.loading) return <div className="page muted">Loading…</div>
  if (!rec || !t)
    return (
      <div className="page">
        {back}
        <p className="muted">
          This recording has no transcript yet. Transcribe it in Facilitate › Hot wash.
        </p>
      </div>
    )
  const started = new Date(rec.startedAt)
  return (
    <div className="page page--wide hw-page">
      {back}
      <PageHeader
        eyebrow="Hot wash transcript"
        title={rec.title}
        description={`${started.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · ${recordingClock(rec.durationSec)} · ${t.model} · ${t.language}${t.complete ? '' : ' · partial'}`}
      />
      <Editor
        projectPath={projectPath}
        scenario={scenarioQ.data}
        recording={rec}
        draft={draft}
        transcript={t}
      />
    </div>
  )
}
