import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { FacilitatorState } from '@shared/ipc'
import { mediaUrl } from '@shared/media-url'
import type { Inject } from '@shared/schemas/inject'
import type { Scenario } from '@shared/schemas/scenario'
import { PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { toLabel } from '../../lib/msel'
import {
  clockMinutes,
  dueRows,
  isDue,
  isRunning,
  nextRow,
  nextTimeJump,
  resetClock,
  setClock,
  toggleClock,
} from './clock'
import { audioAsset, imageAsset, screenAsset } from './delivery'
import { ExerciseClock } from './ExerciseClock'
import { NoMsel, PresentControls, ShortcutsBar, SidePanel, StatusLine } from './FacilitateParts'
import { Timeline, type TimelineEntry } from './Timeline'
import { useDeliveryActions, type UpdateState } from './use-delivery-actions'
import { useFacilitatorState, type SaveStatus } from './use-facilitator-state'
import { usePresenting } from './use-presenting'
import { useShortcuts, useShortcutsEnabled, type ShortcutKeys } from './use-shortcuts'
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
  update: UpdateState
  back: React.ReactNode
}

/** Space toggles the clock, N selects the next due (or next) row, D delivers the selection. */
function useKeys(
  p: ViewProps,
  selected: TimelineEntry | undefined,
  onSelect: (rowId: string) => void,
  deliver: (rowId: string) => void,
): ShortcutKeys {
  const { update, scenario, state } = p
  return useMemo(
    () => ({
      toggle: () => update((s) => toggleClock(s, new Date())),
      next: () => {
        const due = dueRows(scenario.msel, clockMinutes(state, new Date()), state.delivered)[0]
        const next = due ?? nextRow(scenario.msel, state.delivered)
        if (next) onSelect(next.id)
      },
      deliver: () => selected && deliver(selected.row.id),
    }),
    [update, scenario.msel, state, selected, deliver, onSelect],
  )
}

/** Clock, timeline entries, selection and the delivery actions of facilitator mode. */
function useFacilitate(p: ViewProps) {
  const { projectPath, scenario, injects, state, update } = p
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
  const keys = useKeys(p, selected, setSelectedId, actions.deliver)
  return {
    now,
    minutes,
    entries,
    selected,
    setSelectedId,
    displayId,
    setDisplayId,
    announce,
    actions,
    keys,
  }
}

type Facilitate = ReturnType<typeof useFacilitate>

/** The timeline and the side panel, or the empty state when the MSEL has no rows. */
function RunArea(props: ViewProps & { f: Facilitate; onShow: (entry: TimelineEntry) => void }) {
  const { projectPath, scenario, state, update, f } = props
  const { deliver, undo } = f.actions
  if (scenario.msel.length === 0)
    return <NoMsel projectPath={projectPath} scenarioId={scenario.id} />
  return (
    <div className="fac-layout">
      <Timeline
        phases={scenario.phases}
        entries={f.entries}
        selectedId={f.selected?.row.id}
        onSelect={f.setSelectedId}
        onDeliver={deliver}
        onUndo={undo}
      />
      <SidePanel
        projectPath={projectPath}
        scenario={scenario}
        state={state}
        selected={f.selected}
        update={update}
        onDeliver={deliver}
        onUndo={undo}
        onShow={props.onShow}
      />
    </div>
  )
}

function FacilitateView(props: ViewProps) {
  const { scenario, state, update } = props
  const f = useFacilitate(props)
  const show = (entry: TimelineEntry) =>
    void f.actions.present(entry, screenAsset(entry.inject)?.id)
  const presenting = usePresenting()
  const [shortcutsOn, setShortcutsOn] = useShortcutsEnabled()
  useShortcuts(f.keys, shortcutsOn)

  return (
    <div className="page page--wide fac-page">
      {props.back}
      <PageHeader
        eyebrow="Facilitate"
        title={scenario.title}
        description="Run the exercise: keep the clock, deliver injects to the room, capture notes for the hot wash."
        actions={
          <PresentControls
            displayId={f.displayId}
            onDisplay={f.setDisplayId}
            presenting={presenting}
            selected={f.selected}
            onPresent={show}
          />
        }
      />
      <ExerciseClock
        minutes={f.minutes}
        running={isRunning(state)}
        now={f.now}
        startWallClock={scenario.brief.startWallClock}
        dueCount={f.entries.filter((e) => e.due).length}
        nextJump={nextTimeJump(scenario.msel, f.minutes)}
        onToggle={f.keys.toggle}
        onReset={() => update((s) => resetClock(s))}
        onSet={(m) => update((s) => setClock(s, m, new Date()))}
      />
      <StatusLine announce={f.announce} saveStatus={props.saveStatus} />
      <ShortcutsBar on={shortcutsOn} onChange={setShortcutsOn} />
      <RunArea {...props} f={f} onShow={show} />
    </div>
  )
}
