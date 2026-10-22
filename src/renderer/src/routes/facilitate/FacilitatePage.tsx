import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Tabs } from 'radix-ui'
import { ArrowLeft, MonitorX } from 'lucide-react'
import type { FacilitatorState } from '@shared/ipc'
import { mediaUrl } from '@shared/media-url'
import type { Inject } from '@shared/schemas/inject'
import type { Scenario } from '@shared/schemas/scenario'
import { Button, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { toLabel } from '../../lib/msel'
import {
  clockMinutes,
  dueRows,
  exerciseStamp,
  isDue,
  isRunning,
  nextRow,
  nextTimeJump,
  resetClock,
  setClock,
  toggleClock,
} from './clock'
import { audioAsset, deliveryAction, imageAsset, screenAsset } from './delivery'
import { ExerciseClock } from './ExerciseClock'
import { HotWashPanel } from './HotWashPanel'
import { InjectPanel } from './InjectPanel'
import { Timeline, type TimelineEntry } from './Timeline'
import { useFacilitatorState, type SaveStatus } from './use-facilitator-state'
import './facilitate.css'

/** Re-render every second while the clock runs (and every 15 s for the local time). */
function useNow(running: boolean): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), running ? 1000 : 15_000)
    return () => clearInterval(id)
  }, [running])
  return now
}

function buildEntries(
  projectPath: string,
  scenario: Scenario,
  injects: Inject[],
  state: FacilitatorState,
  minutes: number,
): TimelineEntry[] {
  const byId = new Map(injects.map((i) => [i.id, i]))
  const byRow = new Map(injects.map((i) => [i.mselRowId, i]))
  return scenario.msel.map((row) => {
    const inject = (row.injectId && byId.get(row.injectId)) || byRow.get(row.id)
    const thumb = imageAsset(inject)
    return {
      row,
      inject,
      target: toLabel(row, scenario.roles),
      thumbUrl: thumb ? mediaUrl(projectPath, thumb.path) : undefined,
      hasAudio: !!audioAsset(inject),
      due: isDue(row, minutes, state.delivered),
      deliveredAt: state.delivered[row.id]?.exerciseTime,
      hasNote: !!state.notes[row.id]?.trim(),
    }
  })
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))

/** Space start/pause, N next due, D deliver selected — never while typing. */
function useShortcuts(keys: { toggle: () => void; next: () => void; deliver: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      const k = e.key.toLowerCase()
      if (k === ' ') keys.toggle()
      else if (k === 'n') keys.next()
      else if (k === 'd') keys.deliver()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [keys])
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Could not save — changes kept on this screen',
}

function DisplayPicker(props: { value: string; onChange: (v: string) => void }) {
  const displays = useIpcQuery('facilitator:displays', undefined)
  return (
    <label className="fac-display">
      <span className="field__label">Present on</span>
      <select
        className="select"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        <option value="">Second display (auto)</option>
        {(displays.data ?? []).map((d) => (
          <option key={d.id} value={String(d.id)}>
            {d.label} · {d.width}×{d.height}
            {d.primary ? ' (this screen)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function FacilitatePage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const req = { projectPath, scenarioId }
  const scenarioQ = useIpcQuery('scenarios:get', req)
  const injectsQ = useIpcQuery('injects:list', req)
  const store = useFacilitatorState(projectPath, scenarioId)
  const back = (
    <Link to={`/p/${projectKey(projectPath)}/scenarios/${scenarioId}`} className="fac-back">
      <ArrowLeft size={14} aria-hidden /> Back to scenario
    </Link>
  )
  const error = scenarioQ.error?.message ?? injectsQ.error?.message ?? store.loadError
  if (error)
    return (
      <div className="page">
        {back}
        <p className="field__error" role="alert">
          Could not load facilitator mode: {error}
        </p>
      </div>
    )
  if (!scenarioQ.data || !injectsQ.data || !store.state)
    return <div className="page muted">Loading…</div>
  return (
    <FacilitateView
      projectPath={projectPath}
      scenario={scenarioQ.data}
      injects={injectsQ.data}
      state={store.state}
      saveStatus={store.saveStatus}
      update={store.update}
      back={back}
    />
  )
}

interface ViewProps {
  projectPath: string
  scenario: Scenario
  injects: Inject[]
  state: FacilitatorState
  saveStatus: SaveStatus
  update: ReturnType<typeof useFacilitatorState>['update']
  back: React.ReactNode
}

function FacilitateView({
  projectPath,
  scenario,
  injects,
  state,
  saveStatus,
  update,
  back,
}: ViewProps) {
  const now = useNow(isRunning(state))
  const minutes = clockMinutes(state, now)
  const entries = useMemo(
    () => buildEntries(projectPath, scenario, injects, state, minutes),
    [projectPath, scenario, injects, state, minutes],
  )
  const [selectedId, setSelectedId] = useState(() => nextRow(scenario.msel, state.delivered)?.id)
  const [displayId, setDisplayId] = useState('')
  const [announce, setAnnounce] = useState('')
  const selected = entries.find((e) => e.row.id === selectedId) ?? entries[0]
  const actions = useDeliveryActions({
    projectPath,
    scenarioId: scenario.id,
    displayId,
    entries,
    state,
    update,
    onSelect: setSelectedId,
    onAnnounce: setAnnounce,
  })
  const { deliver, undo, present } = actions

  const keys = useMemo(
    () => ({
      toggle: () => update((s) => toggleClock(s, new Date())),
      next: () => {
        const due = dueRows(scenario.msel, clockMinutes(state, new Date()), state.delivered)[0]
        const next = due ?? nextRow(scenario.msel, state.delivered)
        if (next) setSelectedId(next.id)
      },
      deliver: () => selected && deliver(selected.row.id),
    }),
    [update, scenario.msel, state, selected, deliver],
  )
  useShortcuts(keys)

  const dueCount = entries.filter((e) => e.due).length
  return (
    <div className="page page--wide fac-page">
      {back}
      <PageHeader
        eyebrow="Facilitate"
        title={scenario.title}
        description="Run the exercise: keep the clock, deliver injects to the room, capture notes for the hot wash."
        actions={
          <>
            <DisplayPicker value={displayId} onChange={setDisplayId} />
            <Button onClick={() => void call('facilitator:close-present')}>
              <MonitorX size={16} aria-hidden /> Close presentation
            </Button>
          </>
        }
      />
      <ExerciseClock
        minutes={minutes}
        running={isRunning(state)}
        now={now}
        startWallClock={scenario.brief.startWallClock}
        dueCount={dueCount}
        nextJump={nextTimeJump(scenario.msel, minutes)}
        onToggle={keys.toggle}
        onReset={() => update((s) => resetClock(s))}
        onSet={(m) => update((s) => setClock(s, m, new Date()))}
      />
      <p className="fac-status" role="status" aria-live="polite">
        <span>{announce}</span>
        <span className="muted">{SAVE_LABEL[saveStatus]}</span>
      </p>
      <p className="fac-keys muted">
        Keys: <kbd>Space</kbd> start/pause · <kbd>N</kbd> next due · <kbd>D</kbd> deliver selected ·{' '}
        <kbd>↑</kbd>/<kbd>↓</kbd> move in timeline · <kbd>Esc</kbd> on the presentation screen
        closes it
      </p>
      {scenario.msel.length === 0 ? (
        <EmptyState
          title="No MSEL rows"
          body="Generate or write the MSEL before running the exercise."
        />
      ) : (
        <div className="fac-layout">
          <Timeline
            phases={scenario.phases}
            entries={entries}
            selectedId={selected?.row.id}
            onSelect={setSelectedId}
            onDeliver={deliver}
            onUndo={undo}
          />
          <SidePanel
            projectPath={projectPath}
            scenario={scenario}
            state={state}
            selected={selected}
            update={update}
            onDeliver={deliver}
            onUndo={undo}
            onShow={(entry) => void present(entry, screenAsset(entry.inject)?.id)}
          />
        </div>
      )}
    </div>
  )
}

interface ActionDeps {
  projectPath: string
  scenarioId: string
  displayId: string
  entries: TimelineEntry[]
  state: FacilitatorState
  update: ViewProps['update']
  onSelect: (rowId: string) => void
  onAnnounce: (text: string) => void
}

/** Deliver / undo / show-on-screen for timeline rows. */
function useDeliveryActions(d: ActionDeps) {
  const { projectPath, scenarioId, displayId, entries, state, update, onSelect, onAnnounce } = d
  const present = useCallback(
    async (entry: TimelineEntry, assetId?: string) => {
      if (!entry.inject) return
      try {
        await call('facilitator:present', {
          projectPath,
          scenarioId,
          injectId: entry.inject.id,
          ...(assetId ? { assetId } : {}),
          ...(displayId ? { displayId: Number(displayId) } : {}),
        })
      } catch (err) {
        toast.error('Could not open the presentation screen', (err as Error).message)
      }
    },
    [projectPath, scenarioId, displayId],
  )

  const deliver = useCallback(
    (rowId: string) => {
      const entry = entries.find((e) => e.row.id === rowId)
      if (!entry || state.delivered[rowId]) return
      const now = new Date()
      const stamp = { at: now.toISOString(), exerciseTime: exerciseStamp(clockMinutes(state, now)) }
      update((s) => ({ ...s, delivered: { ...s.delivered, [rowId]: stamp } }))
      onSelect(rowId)
      const action = deliveryAction(entry.inject)
      if (action.kind === 'present' || action.kind === 'play') void present(entry, action.asset.id)
      onAnnounce(deliveredMessage(entry, action.kind))
    },
    [entries, state, update, present, onSelect, onAnnounce],
  )

  const undo = useCallback(
    (rowId: string) => {
      update((s) => {
        const { [rowId]: _drop, ...rest } = s.delivered
        return { ...s, delivered: rest }
      })
      onAnnounce(`${rowId} marked not delivered`)
    },
    [update, onAnnounce],
  )
  return { present, deliver, undo }
}

function deliveredMessage(entry: TimelineEntry, kind: ReturnType<typeof deliveryAction>['kind']) {
  const id = entry.row.id
  if (kind === 'present') return `${id} delivered — showing on the presentation screen`
  if (kind === 'play') return `${id} delivered — playing audio on the presentation screen`
  if (kind === 'hand') return `${id} delivered — print / hand to ${entry.target}`
  if (kind === 'read') return `${id} delivered — read aloud`
  return `${id} delivered`
}

function SidePanel(props: {
  projectPath: string
  scenario: Scenario
  state: FacilitatorState
  selected: TimelineEntry | undefined
  update: ViewProps['update']
  onDeliver: (rowId: string) => void
  onUndo: (rowId: string) => void
  onShow: (entry: TimelineEntry) => void
}) {
  const { selected, state, update } = props
  return (
    <Tabs.Root defaultValue="inject" className="fac-side">
      <Tabs.List className="fac-tabs" aria-label="Facilitator panels">
        <Tabs.Trigger value="inject" className="fac-tabs__trigger">
          Inject
        </Tabs.Trigger>
        <Tabs.Trigger value="hotwash" className="fac-tabs__trigger">
          Hot wash
        </Tabs.Trigger>
        <Tabs.Trigger value="notes" className="fac-tabs__trigger">
          General notes
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="inject" className="fac-tabs__panel">
        {selected && (
          <InjectPanel
            projectPath={props.projectPath}
            entry={selected}
            note={state.notes[selected.row.id] ?? ''}
            onNote={(text) =>
              update((s) => ({ ...s, notes: { ...s.notes, [selected.row.id]: text } }), {
                debounce: true,
              })
            }
            onDeliver={() => props.onDeliver(selected.row.id)}
            onUndo={() => props.onUndo(selected.row.id)}
            onShow={() => props.onShow(selected)}
          />
        )}
      </Tabs.Content>
      <Tabs.Content value="hotwash" className="fac-tabs__panel">
        <HotWashPanel scenario={props.scenario} state={state} />
      </Tabs.Content>
      <Tabs.Content value="notes" className="fac-tabs__panel">
        <div className="field">
          <label className="field__label" htmlFor="fac-general-notes">
            General notes
          </label>
          <textarea
            id="fac-general-notes"
            className="textarea"
            rows={14}
            value={state.generalNotes}
            placeholder="Observations that are not tied to one inject"
            onChange={(e) =>
              update((s) => ({ ...s, generalNotes: e.target.value }), { debounce: true })
            }
          />
        </div>
      </Tabs.Content>
    </Tabs.Root>
  )
}
