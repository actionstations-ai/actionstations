import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import type { FacilitatorState } from '@shared/ipc'
import { mediaUrl } from '@shared/media-url'
import { formatExerciseTime } from '@shared/schemas/common'
import type { Inject } from '@shared/schemas/inject'
import type { MselRow, Scenario } from '@shared/schemas/scenario'
import { scenarioStart } from '@shared/compliance/scenario-time'
import { regulationLabel, sessionOf } from '@shared/schemas/compliance'
import { PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { toLabel } from '../../lib/msel'
import {
  clockMinutes,
  clockRate,
  dueRows,
  isDue,
  isRunning,
  nextRow,
  nextTimeJump,
  toggleClock,
} from './clock'
import { addressedTo, recipients } from '@shared/facilitator/recipients'
import { clearAnswer } from '@shared/facilitator/tracker'
import { call } from '../../lib/api'
import { DeliverToDialog, RewindDialog, ResetDialog } from './ClockDialogs'
import { CommitmentDialog } from './TrackerPanel'
import { TimelineFilter } from './TimelineFilter'
import { useTimelineFilter } from './use-timeline-filter'
import { useClockControls } from './use-clock-controls'
import { answerNow, useAnnounceFlags, useFlags, useNoteScan } from './use-tracker'
import { availability, pathFor } from './branching'
import { audioAsset, imageAsset, screenAsset } from './delivery'
import { fireRowTriggers } from './compliance'
import { ExerciseClock } from './ExerciseClock'
import { RegulatoryClocks } from './RegulatoryClocks'
import {
  NoMsel,
  PresentControls,
  ShortcutsBar,
  SidePanel,
  StatusLine,
  type ControllerTools,
} from './FacilitateParts'
import { Timeline, type TimelineEntry } from './Timeline'
import { hasBranches } from '@shared/branching/graph'
import { useBranchLog } from './use-branch-log'
import { useLiveDelivery } from './live/use-live-delivery'
import { useDeliveryActions, type UpdateState } from './use-delivery-actions'
import { useFacilitatorState, type SaveStatus } from './use-facilitator-state'
import { usePresenting } from './use-presenting'
import { useShortcuts, useShortcutsEnabled, type ShortcutKeys } from './use-shortcuts'
import { DraftAarButton } from '../scenarios/DraftAarButton'
import { hasRecordEvidence } from '../scenarios/aar-evidence'
import { RecorderControls } from './RecorderControls'
import { useRecorder, type Recorder } from './use-recorder'
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
  const path = pathFor(scenario, state)
  const lanes = new Map((scenario.branches ?? []).map((b) => [b.id, b]))
  return scenario.msel.map((row) => {
    const lane = row.branchId ? lanes.get(row.branchId) : undefined
    const available = availability(path, row.id)
    const inject = (row.injectId && byId.get(row.injectId)) || byRow.get(row.id)
    const thumb = imageAsset(inject)
    return {
      row,
      inject,
      target: toLabel(row, scenario.roles),
      seats: recipients(row, scenario.roles).roleIds.length,
      thumbUrl: thumb ? mediaUrl(projectPath, thumb.path) : undefined,
      hasAudio: !!audioAsset(inject),
      due: available === 'on_path' && isDue(row, minutes, state.delivered),
      ...(path ? { availability: available } : {}),
      ...(lane ? { lane: { chip: lane.id.toUpperCase(), label: lane.label } } : {}),
      ...(path?.openDecision?.id === row.decision?.id && row.decision
        ? { decisionOpen: true }
        : {}),
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
): Omit<ShortcutKeys, 'record' | 'stopRecording'> {
  const { update, scenario, state } = p
  const playable = useMemo(() => pathFor(scenario, state)?.rows ?? scenario.msel, [scenario, state])
  return useMemo(
    () => ({
      toggle: () => update((s) => toggleClock(s, new Date())),
      next: () => {
        const due = dueRows(playable, clockMinutes(state, new Date()), state.delivered)[0]
        const next = due ?? nextRow(playable, state.delivered)
        if (next) onSelect(next.id)
      },
      deliver: () => selected && deliver(selected.row.id),
    }),
    [update, playable, state, selected, deliver, onSelect],
  )
}

/**
 * Regulatory clocks (#426): the regulations the project has on (plus any whose trigger already
 * fired), STARTEX on the scenario calendar, and how a delivered row fires its triggers.
 */
function useCompliance(projectPath: string, scenario: Scenario, state: FacilitatorState) {
  const list = useIpcQuery('compliance:list', { projectPath })
  const startex = scenario.msel.find((r) => r.purposeTag === 'STARTEX')?.event
  const { startDate, startWallClock } = scenario.brief
  const start = useMemo(
    () => scenarioStart({ startDate, startWallClock, startexText: startex }, new Date()),
    [startDate, startWallClock, startex],
  )
  const fired = useMemo(() => new Set(sessionOf(state).fired.map((f) => f.regulationId)), [state])
  const all = list.data?.regulations
  const regulations = useMemo(
    () =>
      (all ?? []).filter((r) => r.enabled || fired.has(r.regulation.id)).map((r) => r.regulation),
    [all, fired],
  )
  const enabled = useMemo(
    () => new Set((all ?? []).filter((r) => r.enabled).map((r) => r.regulation.id)),
    [all],
  )
  const fireRow = useCallback(
    (s: FacilitatorState, row: MselRow, minutes: number) =>
      fireRowTriggers(s, row, enabled, minutes, start.at).state,
    [enabled, start.at],
  )
  const startsClocks = useCallback(
    (row: MselRow) =>
      (row.triggers ?? [])
        .filter((t) => enabled.has(t.regulationId))
        .map((t) => {
          const reg = all?.find((r) => r.regulation.id === t.regulationId)?.regulation
          return reg ? regulationLabel(reg) : t.regulationId
        }),
    [enabled, all],
  )
  return { regulations, start, fireRow, startsClocks }
}

/** Tracker flags, answers, the commitment dialog and the "Deliver to…" picker (spec 0428). */
function useControllerTools(
  p: ViewProps,
  minutes: number,
  h: {
    onSelect: (rowId: string) => void
    onAnnounce: (text: string) => void
    onShowEngagement: ControllerTools['onShowEngagement']
  },
) {
  const { scenario, state, update } = p
  const flags = useFlags(scenario, state, minutes)
  useAnnounceFlags(flags, h.onAnnounce)
  useNoteScan(scenario, state, minutes, update)
  const [commitmentOpen, setCommitmentOpen] = useState(false)
  const [deliverToId, setDeliverToId] = useState<string>()
  const isAnswered = useCallback(
    (rowId: string) => !!state.tracker?.responses[rowId],
    [state.tracker],
  )
  const { onAnnounce } = h
  const onAnswer = useCallback(
    (rowId: string) => {
      const was = !!state.tracker?.responses[rowId]
      update((s) => (was ? clearAnswer(s, rowId) : answerNow(s, rowId, minutes)))
      onAnnounce(was ? `${rowId} answer cleared` : `${rowId} marked answered`)
    },
    [state.tracker, update, minutes, onAnnounce],
  )
  const tools: ControllerTools = {
    minutes,
    flags,
    isAnswered,
    onAnswer,
    onDeliverTo: setDeliverToId,
    onShowEngagement: h.onShowEngagement,
    onGoToRow: h.onSelect,
    onAnnounce,
    onAddCommitment: () => setCommitmentOpen(true),
  }
  return { tools, commitmentOpen, setCommitmentOpen, deliverToId, setDeliverToId, onAnswer }
}

/** Clock, timeline entries, selection and the delivery actions of facilitator mode. */
function useFacilitate(p: ViewProps) {
  const { projectPath, scenario, injects, state, update } = p
  const compliance = useCompliance(projectPath, scenario, state)
  const now = useNow(isRunning(state))
  const minutes = clockMinutes(state, now)
  const live = useLiveDelivery(projectPath, scenario.id)
  const base = useMemo(
    () => buildEntries(projectPath, scenario, injects, state, minutes),
    [projectPath, scenario, injects, state, minutes],
  )
  const entries = useMemo(
    () => (live.active ? base.map((e) => ({ ...e, live: live.summary(e.row.id) })) : base),
    [base, live],
  )
  const [selectedId, setSelectedId] = useState(() => nextRow(scenario.msel, state.delivered)?.id)
  const [displayId, setDisplayId] = useState('')
  const [announce, setAnnounce] = useState('')
  const selected = entries.find((e) => e.row.id === selectedId) ?? entries[0]
  const branchLog = useBranchLog(projectPath, scenario.id)
  const actions = useDeliveryActions({
    projectPath,
    scenarioId: scenario.id,
    displayId,
    entries,
    state,
    update,
    onSelect: setSelectedId,
    onAnnounce: setAnnounce,
    fireRow: compliance.fireRow,
    startsClocks: compliance.startsClocks,
    roles: scenario.roles,
    live,
    branching: hasBranches(scenario)
      ? { path: pathFor(scenario, state), log: branchLog }
      : undefined,
  })
  const keys = useKeys(p, selected, setSelectedId, actions.deliver)
  const controls = useClockControls({ state, update, undo: actions.undo, onAnnounce: setAnnounce })
  const ct = useControllerTools(p, minutes, {
    onSelect: setSelectedId,
    onAnnounce: setAnnounce,
    onShowEngagement: (entry, cachePath) => void actions.present(entry, undefined, cachePath),
  })
  return {
    ct,
    controls,
    now,
    minutes,
    entries,
    selected,
    setSelectedId,
    displayId,
    setDisplayId,
    announce,
    setAnnounce,
    actions,
    keys,
    compliance,
    live,
    branchLog,
  }
}

type Facilitate = ReturnType<typeof useFacilitate>

/** The timeline and the side panel, or the empty state when the MSEL has no rows. */
function RunArea(props: ViewProps & { f: Facilitate; onShow: (entry: TimelineEntry) => void }) {
  const { projectPath, scenario, state, update, f } = props
  const { deliver, undo } = f.actions
  const [filter, setFilter] = useTimelineFilter(scenario.id)
  const visible = useMemo(
    () => f.entries.filter((e) => addressedTo(e.row, scenario.roles, filter)),
    [f.entries, scenario.roles, filter],
  )
  if (scenario.msel.length === 0)
    return <NoMsel projectPath={projectPath} scenarioId={scenario.id} />
  return (
    <div className="fac-layout">
      <div className="fac-main">
        <TimelineFilter roles={scenario.roles} value={filter} onChange={setFilter} />
        {visible.length === 0 && (
          <p className="muted">No rows are addressed to that team or role.</p>
        )}
        <Timeline
          phases={scenario.phases}
          entries={visible}
          selectedId={f.selected?.row.id}
          onSelect={f.setSelectedId}
          onDeliver={deliver}
          onUndo={undo}
        />
      </div>
      <SidePanel
        tools={f.ct.tools}
        projectPath={projectPath}
        scenario={scenario}
        state={state}
        selected={f.selected}
        exerciseTime={formatExerciseTime(f.minutes)}
        update={update}
        onDeliver={deliver}
        onUndo={undo}
        onShow={props.onShow}
        live={f.live}
        branching={
          hasBranches(scenario)
            ? { minutes: f.minutes, onLog: f.branchLog, onAnnounce: f.setAnnounce }
            : undefined
        }
      />
    </div>
  )
}

/** R starts (consent dialog first), pauses or resumes the recording; Shift+R stops it. */
function recorderKeys(recorder: Recorder, openConsent: () => void) {
  const { phase } = recorder.state
  return {
    record: () => {
      if (phase === 'idle') openConsent()
      else if (phase === 'recording') void recorder.pause()
      else if (phase === 'paused') void recorder.resume()
    },
    stopRecording: () => {
      if (phase === 'recording' || phase === 'paused') void recorder.stop()
    },
  }
}

/** The hot wash recorder for this scenario (#425) and the listing it shows. */
function useHotwashRecorder(props: ViewProps, minutes: number) {
  const { projectPath, scenario } = props
  const listing = useIpcQuery('hotwash:list', { projectPath, scenarioId: scenario.id })
  const refetch = listing.refetch
  const onChange = useCallback(() => void refetch(), [refetch])
  const recorder = useRecorder(
    { projectPath, scenarioId: scenario.id, exerciseMin: Math.floor(minutes) },
    onChange,
  )
  const [consentOpen, setConsentOpen] = useState(false)
  return { listing: listing.data, recorder, consentOpen, setConsentOpen }
}

function FacilitateView(props: ViewProps) {
  const { scenario, state, update } = props
  const f = useFacilitate(props)
  const show = (entry: TimelineEntry) =>
    void f.actions.present(entry, screenAsset(entry.inject)?.id)
  const presenting = usePresenting()
  const [shortcutsOn, setShortcutsOn] = useShortcutsEnabled()
  const hw = useHotwashRecorder(props, f.minutes)
  const { recorder, setConsentOpen } = hw
  const { controls: clock, ct } = f
  const selectedId = f.selected?.row.id
  const keys = useMemo(
    () => ({
      ...f.keys,
      ...recorderKeys(recorder, () => setConsentOpen(true)),
      toggle: clock.toggle,
      nudge: clock.nudge,
      deliverTo: () => selectedId && ct.setDeliverToId(selectedId),
      answer: () => selectedId && ct.onAnswer(selectedId),
      commitment: () => ct.setCommitmentOpen(true),
    }),
    [f.keys, recorder, setConsentOpen, clock.toggle, clock.nudge, ct, selectedId],
  )
  useShortcuts(keys, shortcutsOn)
  useEffect(
    // The engagement renders are only a cache: drop them when Facilitate closes.
    () => () => {
      void call('render:engagement-clear', { projectPath: props.projectPath }).catch(
        () => undefined,
      )
    },
    [props.projectPath],
  )
  const deliverRow = f.entries.find((e) => e.row.id === ct.deliverToId)

  return (
    <div className="page page--wide fac-page">
      {props.back}
      <PageHeader
        eyebrow="Facilitate"
        title={scenario.title}
        description="Run the exercise: keep the clock, deliver injects to the room, capture notes for the hot wash."
        actions={
          <>
            <PresentControls
              displayId={f.displayId}
              onDisplay={f.setDisplayId}
              presenting={presenting}
              selected={f.selected}
              onPresent={show}
            />
            <DraftAarButton
              projectPath={props.projectPath}
              scenarioId={scenario.id}
              hasEvidence={hasRecordEvidence(state)}
              hasDraft={!!scenario.documents.aar}
            />
          </>
        }
      />
      <ExerciseClock
        minutes={f.minutes}
        running={isRunning(state)}
        now={f.now}
        startWallClock={scenario.brief.startWallClock}
        dueCount={f.entries.filter((e) => e.due).length}
        nextJump={nextTimeJump(scenario.msel, f.minutes)}
        rate={clockRate(state)}
        onToggle={clock.toggle}
        onReset={clock.reset}
        onSet={clock.set}
        onNudge={clock.nudge}
        onRate={clock.setRate}
        onJump={clock.jump}
      />
      <RewindDialog
        move={clock.pendingMove}
        onResolve={clock.resolveMove}
        onCancel={clock.cancelMove}
      />
      <ResetDialog
        open={clock.confirmingReset}
        onConfirm={clock.confirmReset}
        onCancel={clock.cancelReset}
      />
      <DeliverToDialog
        open={!!deliverRow}
        rowId={ct.deliverToId ?? ''}
        roles={scenario.roles}
        planned={deliverRow ? recipients(deliverRow.row, scenario.roles).roleIds : []}
        onCancel={() => ct.setDeliverToId(undefined)}
        onDeliver={(ids) => {
          if (ct.deliverToId) f.actions.deliver(ct.deliverToId, ids)
          ct.setDeliverToId(undefined)
        }}
      />
      <CommitmentDialog
        open={ct.commitmentOpen}
        scenario={scenario}
        minutes={f.minutes}
        rowId={selectedId}
        update={update}
        onClose={() => ct.setCommitmentOpen(false)}
        onAnnounce={f.setAnnounce}
      />
      <RegulatoryClocks
        regulations={f.compliance.regulations}
        state={state}
        update={update}
        minutes={f.minutes}
        start={f.compliance.start}
      />
      <RecorderControls
        recorder={hw.recorder}
        freeBytes={hw.listing?.freeBytes}
        keepAudio={hw.listing?.settings.keepAudio ?? false}
        shortcutsOn={shortcutsOn}
        consentOpen={hw.consentOpen}
        onConsentOpenChange={hw.setConsentOpen}
        onAnnounce={f.setAnnounce}
      />
      <StatusLine announce={f.announce} saveStatus={props.saveStatus} />
      <ShortcutsBar on={shortcutsOn} onChange={setShortcutsOn} />
      <RunArea {...props} f={f} onShow={show} />
    </div>
  )
}
