// The parts of facilitator mode around the timeline: the presentation controls, the status
// and shortcut lines, the empty MSEL state and the side panel (inject, hot wash, notes).
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Tabs } from 'radix-ui'
import { Monitor, MonitorX } from 'lucide-react'
import type { FacilitatorState } from '@shared/ipc'
import type { Scenario } from '@shared/schemas/scenario'
import { Button, EmptyState } from '../../components/ui'
import { call } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import { DecisionPanel } from './DecisionPanel'
import type { BranchLog } from './use-branch-log'
import { EvaluationTab } from './EvaluationTab'
import { HotWashPanel } from './HotWashPanel'
import { TrackerPanel } from './TrackerPanel'
import type { Flag } from '@shared/facilitator/tracker'
import { InjectPanel } from './InjectPanel'
import type { LiveDelivery } from './live/use-live-delivery'
import { LivePanel } from './live/LivePanel'
import { HotWashBoard } from './live/HotWashBoard'
import { MessagesPanel, MessagesTabLabel } from './live/MessagesPanel'
import { SimcellPanel } from './SimcellPanel'
import { tallySourceFromVotes } from '@shared/branching/vote-input'
import { useLiveVotes } from './live/use-live-votes'
import { LiveSurveysSection } from './live/SurveySend'
import { VotePanel } from './live/VotePanel'
import { VOTES } from './live/vote-strings'
import { PostExerciseChecklist } from './PostExerciseChecklist'
import { RoomPanel } from './live/RoomPanel'
import { SessionsList } from './live/SessionsList'
import { LIVE } from './live/strings'
import type { TimelineEntry } from './Timeline'
import type { UpdateState } from './use-delivery-actions'
import type { SaveStatus } from './use-facilitator-state'

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

/** Header actions: which display to present on, and open / close the presentation. */
export function PresentControls(props: {
  displayId: string
  onDisplay: (id: string) => void
  presenting: boolean
  selected: TimelineEntry | undefined
  onPresent: (entry: TimelineEntry) => void
}) {
  const { selected } = props
  return (
    <>
      <DisplayPicker value={props.displayId} onChange={props.onDisplay} />
      {props.presenting ? (
        <Button onClick={() => void call('facilitator:close-present')}>
          <MonitorX size={16} aria-hidden /> Close presentation
        </Button>
      ) : (
        <Button
          disabled={!selected?.inject}
          title={selected?.inject ? undefined : 'Select a row that has an inject to show'}
          onClick={() => selected && props.onPresent(selected)}
        >
          <Monitor size={16} aria-hidden /> Open presentation
        </Button>
      )}
    </>
  )
}

export function StatusLine(props: { announce: string; saveStatus: SaveStatus }) {
  return (
    <p className="fac-status" role="status" aria-live="polite">
      <span>{props.announce}</span>
      <span className="muted">{SAVE_LABEL[props.saveStatus]}</span>
    </p>
  )
}

export function ShortcutsBar(props: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="fac-keys muted row">
      <label className="row">
        <input
          type="checkbox"
          checked={props.on}
          onChange={(e) => props.onChange(e.target.checked)}
        />
        Single-key shortcuts
      </label>
      <span>
        <kbd>Space</kbd> start/pause · <kbd>N</kbd> next due · <kbd>D</kbd> deliver selected ·{' '}
        <kbd>↑</kbd>/<kbd>↓</kbd> move in timeline · <kbd>Esc</kbd> on the presentation screen
        closes it
      </span>
    </div>
  )
}

export function NoMsel(props: { projectPath: string; scenarioId: string }) {
  return (
    <EmptyState
      title="No MSEL rows"
      body="Generate or write the MSEL before running the exercise."
      actions={
        <Link
          className="btn btn--primary"
          to={`/p/${projectKey(props.projectPath)}/scenarios/${props.scenarioId}?tab=msel`}
        >
          Open the MSEL
        </Link>
      }
    />
  )
}

function GeneralNotes(props: { state: FacilitatorState; update: UpdateState }) {
  const { update } = props
  return (
    <div className="field">
      <label className="field__label" htmlFor="fac-general-notes">
        General notes
      </label>
      <textarea
        id="fac-general-notes"
        className="textarea"
        rows={14}
        value={props.state.generalNotes}
        placeholder="Observations that are not tied to one inject"
        onChange={(e) =>
          update((s) => ({ ...s, generalNotes: e.target.value }), { debounce: true })
        }
      />
    </div>
  )
}

/** What the controller tools (spec 0428) add to the side panel. */
export interface ControllerTools {
  minutes: number
  flags: Flag[]
  isAnswered: (rowId: string) => boolean
  onAnswer: (rowId: string) => void
  onDeliverTo: (rowId: string) => void
  onShowEngagement: (entry: TimelineEntry, cachePath: string) => void
  onGoToRow: (rowId: string) => void
  onAnnounce: (text: string) => void
  onAddCommitment: () => void
  onNotifyEvaluators?: ((text: string, rowId: string) => Promise<void>) | undefined
}

export function SidePanel(props: {
  tools: ControllerTools
  projectPath: string
  scenario: Scenario
  state: FacilitatorState
  selected: TimelineEntry | undefined
  /** The exercise clock ("H:MM"), recorded with each rating. */
  exerciseTime: string
  update: UpdateState
  onDeliver: (rowId: string) => void
  onUndo: (rowId: string) => void
  onShow: (entry: TimelineEntry) => void
  /** Live play delivery (#412); absent when the page has no session support. */
  live?: LiveDelivery
  /** Present when the scenario has branches (spec 0430): shows the Decisions tab. */
  branching?: { minutes: number; onLog: BranchLog; onAnnounce: (text: string) => void } | undefined
}) {
  const { selected, state, update, tools } = props
  const [tab, setTab] = useState('inject')
  const warnings = tools.flags.filter((f) => f.level === 'warn').length
  const liveVotes = useLiveVotes(props.projectPath, props.scenario.id)
  const tallySource = useMemo(() => tallySourceFromVotes(liveVotes.votes), [liveVotes.votes])
  return (
    <Tabs.Root value={tab} onValueChange={setTab} className="fac-side">
      <PostExerciseChecklist
        projectPath={props.projectPath}
        scenario={props.scenario}
        state={state}
      />
      <Tabs.List className="fac-tabs" aria-label="Facilitator panels">
        <Tabs.Trigger value="inject" className="fac-tabs__trigger">
          Inject
        </Tabs.Trigger>
        {props.branching && (
          <Tabs.Trigger value="decisions" className="fac-tabs__trigger">
            Decisions
          </Tabs.Trigger>
        )}
        <Tabs.Trigger value="tracker" className="fac-tabs__trigger">
          Tracker
          {warnings > 0 && (
            <span className="fac-tabs__badge" aria-label={`, ${warnings} open`}>
              {warnings}
            </span>
          )}
        </Tabs.Trigger>
        <Tabs.Trigger value="evaluation" className="fac-tabs__trigger">
          Evaluation
        </Tabs.Trigger>
        <Tabs.Trigger value="hotwash" className="fac-tabs__trigger">
          Hot wash
        </Tabs.Trigger>
        <Tabs.Trigger value="notes" className="fac-tabs__trigger">
          General notes
        </Tabs.Trigger>
        <Tabs.Trigger value="live" className="fac-tabs__trigger">
          {LIVE.tab}
        </Tabs.Trigger>
        <Tabs.Trigger value="room" className="fac-tabs__trigger">
          Room
        </Tabs.Trigger>
        <Tabs.Trigger value="messages" className="fac-tabs__trigger">
          <MessagesTabLabel projectPath={props.projectPath} scenarioId={props.scenario.id} />
        </Tabs.Trigger>
        <Tabs.Trigger value="simcell" className="fac-tabs__trigger">
          SimCell
        </Tabs.Trigger>
        <Tabs.Trigger value="votes" className="fac-tabs__trigger">
          {VOTES.tab}
        </Tabs.Trigger>
        <Tabs.Trigger value="hotwash-board" className="fac-tabs__trigger">
          Hot wash board
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="inject" className="fac-tabs__panel">
        {selected && (
          <InjectPanel
            projectPath={props.projectPath}
            scenario={props.scenario}
            state={state}
            update={update}
            exerciseTime={props.exerciseTime}
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
            minutes={tools.minutes}
            onDeliverTo={() => tools.onDeliverTo(selected.row.id)}
            answered={tools.isAnswered(selected.row.id)}
            onAnswer={() => tools.onAnswer(selected.row.id)}
            onShowEngagement={tools.onShowEngagement}
            onAnnounce={tools.onAnnounce}
            {...(props.live ? { live: props.live } : {})}
            seam={props.scenario.seams?.find((x) => x.id === selected.row.seamId)}
          />
        )}
      </Tabs.Content>
      {props.branching && (
        <Tabs.Content value="decisions" className="fac-tabs__panel">
          <DecisionPanel
            projectPath={props.projectPath}
            scenario={props.scenario}
            state={state}
            update={update}
            minutes={props.branching.minutes}
            tallySource={tallySource}
            onLog={props.branching.onLog}
            onAnnounce={props.branching.onAnnounce}
          />
        </Tabs.Content>
      )}
      <Tabs.Content value="tracker" className="fac-tabs__panel">
        <TrackerPanel
          scenario={props.scenario}
          state={state}
          update={update}
          flags={tools.flags}
          minutes={tools.minutes}
          onGoToRow={(rowId) => {
            setTab('inject')
            tools.onGoToRow(rowId)
          }}
          onAnnounce={tools.onAnnounce}
          onAddCommitment={tools.onAddCommitment}
          onNotifyEvaluators={tools.onNotifyEvaluators}
        />
      </Tabs.Content>
      <Tabs.Content value="evaluation" className="fac-tabs__panel">
        <EvaluationTab
          projectPath={props.projectPath}
          scenario={props.scenario}
          selected={selected}
          exerciseTime={props.exerciseTime}
        />
      </Tabs.Content>
      <Tabs.Content value="hotwash" className="fac-tabs__panel">
        <HotWashPanel
          projectPath={props.projectPath}
          scenario={props.scenario}
          state={state}
          update={update}
          exerciseTime={props.exerciseTime}
        />
      </Tabs.Content>
      <Tabs.Content value="notes" className="fac-tabs__panel">
        <GeneralNotes state={state} update={update} />
      </Tabs.Content>
      <Tabs.Content value="messages" className="fac-tabs__panel">
        <MessagesPanel projectPath={props.projectPath} scenario={props.scenario} />
      </Tabs.Content>
      <Tabs.Content value="hotwash-board" className="fac-tabs__panel">
        <HotWashBoard projectPath={props.projectPath} scenario={props.scenario} update={update} />
      </Tabs.Content>
      <Tabs.Content value="simcell" className="fac-tabs__panel">
        <SimcellPanel projectPath={props.projectPath} scenario={props.scenario} />
      </Tabs.Content>
      <Tabs.Content value="live" className="fac-tabs__panel">
        <LivePanel
          projectPath={props.projectPath}
          scenarioId={props.scenario.id}
          roles={props.scenario.roles}
        />
        <LiveSurveysSection projectPath={props.projectPath} scenarioId={props.scenario.id} />
        <SessionsList projectPath={props.projectPath} scenario={props.scenario} />
      </Tabs.Content>
      <Tabs.Content value="room" className="fac-tabs__panel">
        <RoomPanel projectPath={props.projectPath} scenario={props.scenario} />
      </Tabs.Content>
      <Tabs.Content value="votes" className="fac-tabs__panel">
        <VotePanel projectPath={props.projectPath} scenario={props.scenario} update={update} />
      </Tabs.Content>
    </Tabs.Root>
  )
}
