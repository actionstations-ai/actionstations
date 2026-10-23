import { Tabs } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { ArrowLeft, Download, Presentation } from 'lucide-react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, PageHeader } from '../../components/ui'
import { MselEditor, type RowJump } from '../../editors/msel/MselEditor'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { isActive } from './live-log'
import { LiveLogPanel } from './LiveLogPanel'
import {
  DocumentsTab,
  ObjectivesTab,
  OverviewTab,
  PendingSavesNote,
  RubricTab,
} from '../../editors/docs'
import { InjectDeck } from '../../editors/inject/InjectDeck'
import { WarningsSection } from './ScenarioSections'
import { GlossaryButton } from '../../components/Glossary'
import { NextActionBar } from './NextActionBar'
import { STATUS_LABEL, STATUS_TONE, type Readiness } from './readiness'
import { useReadiness } from './use-readiness'
import { StageTimeline } from './StageTimeline'
import { useLiveLog } from './use-live-log'
import './scenarios.css'
import { errorText } from '../../lib/errors'

/** Each tab panel opens with a level-2 heading (visually hidden: the tab names it on screen),
 *  so the panels' own h3 sections follow the page's h1 in order. */
function PanelHeading({ children }: { children: ReactNode }) {
  return <h2 className="sr-only">{children}</h2>
}

/** Tab state, lifted so the next-action bar and "Go to row" can switch tabs. Links such as
 *  "Open the MSEL" (?tab=msel) switch the tab while the page stays mounted. */
function useScenarioTab() {
  const tabFromUrl = useSearchParams()[0].get('tab')
  const [tab, setTab] = useState(tabFromUrl ?? 'overview')
  const [urlTab, setUrlTab] = useState(tabFromUrl)
  if (tabFromUrl !== urlTab) {
    setUrlTab(tabFromUrl)
    if (tabFromUrl) setTab(tabFromUrl)
  }
  return [tab, setTab] as const
}

function InjectsTabLabel({ readiness }: { readiness: Readiness | undefined }) {
  const missing = readiness ? readiness.rows - readiness.written : 0
  const unrendered = readiness ? readiness.written - readiness.rendered : 0
  return (
    <>
      Injects
      {missing > 0 && <span className="tab-badge tab-badge--todo">{missing} missing</span>}
      {!missing && unrendered > 0 && <span className="tab-badge">{unrendered} not rendered</span>}
    </>
  )
}

function ScenarioTabs(props: {
  projectPath: string
  scenario: Scenario
  onJob: (jobId: string) => void
  tab: string
  onTab: (tab: string) => void
  readiness: Readiness | undefined
  lintCount: number | undefined
  jump: RowJump | undefined
  onGoToRow: (rowId: string) => void
}) {
  const { projectPath, scenario } = props
  const docProps = { projectPath, scenario, onJob: props.onJob }
  const tabs: [string, ReactNode][] = [
    ['overview', 'Overview'],
    ['objectives', 'Objectives & Roles'],
    ['msel', `MSEL (${scenario.msel.length})`],
    ['injects', <InjectsTabLabel key="injects" readiness={props.readiness} />],
    ['documents', 'Documents'],
    ['rubric', 'Rubric'],
    ['warnings', `Warnings (${props.lintCount ?? scenario.warnings.length})`],
  ]
  return (
    <Tabs.Root value={props.tab} onValueChange={props.onTab} className="tabs">
      <PendingSavesNote scenarioId={scenario.id} />
      <Tabs.List className="tabs__list" aria-label="Scenario sections">
        {tabs.map(([value, label]) => (
          <Tabs.Trigger key={value} value={value} className="tabs__trigger">
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="overview" className="tabs__panel">
        <PanelHeading>Overview</PanelHeading>
        <OverviewTab {...docProps} />
      </Tabs.Content>
      <Tabs.Content value="objectives" className="tabs__panel">
        <PanelHeading>Objectives & roles</PanelHeading>
        <ObjectivesTab {...docProps} />
      </Tabs.Content>
      <Tabs.Content value="msel" className="tabs__panel">
        <PanelHeading>MSEL</PanelHeading>
        <MselEditor
          projectPath={projectPath}
          scenario={scenario}
          {...(props.jump ? { jump: props.jump } : {})}
        />
      </Tabs.Content>
      <Tabs.Content value="injects" className="tabs__panel">
        <PanelHeading>Injects</PanelHeading>
        <InjectDeck {...docProps} />
      </Tabs.Content>
      <Tabs.Content value="documents" className="tabs__panel">
        <PanelHeading>Documents</PanelHeading>
        <DocumentsTab {...docProps} />
      </Tabs.Content>
      <Tabs.Content value="rubric" className="tabs__panel">
        <PanelHeading>Rubric</PanelHeading>
        <RubricTab {...docProps} />
      </Tabs.Content>
      <Tabs.Content value="warnings" className="tabs__panel">
        <PanelHeading>Warnings</PanelHeading>
        <WarningsSection
          projectPath={projectPath}
          scenarioId={scenario.id}
          onGoToRow={props.onGoToRow}
        />
      </Tabs.Content>
    </Tabs.Root>
  )
}

function HeaderActions(props: {
  projectPath: string
  scenario: Scenario
  readiness: Readiness | undefined
}) {
  const { projectPath, scenario, readiness: r } = props
  const base = `/p/${projectKey(projectPath)}/scenarios/${scenario.id}`
  const status = r?.status ?? (scenario.status === 'archived' ? 'archived' : 'draft')
  return (
    <>
      <span title="Draft → Injects written → Media rendered → Ready (no lint errors)">
        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
      </span>
      <GlossaryButton />
      {r?.next !== 'run' && (
        <>
          <Link className="btn" to={`${base}/facilitate`}>
            <Presentation size={16} aria-hidden /> Facilitate
          </Link>
          <Link className="btn" to={`${base}/export`}>
            <Download size={16} aria-hidden /> Export…
          </Link>
        </>
      )}
    </>
  )
}

export default function ScenarioPage() {
  const params = useParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const scenarioId = params.scenarioId ?? ''
  const startedJob = (useLocation().state as { jobId?: string } | null)?.jobId
  const query = useIpcQuery('scenarios:get', { projectPath, scenarioId }, { enabled: !!scenarioId })
  const { log, follow } = useLiveLog(projectPath, scenarioId, startedJob)
  const scenario = query.data
  const { readiness, lintCount } = useReadiness(projectPath, scenario)
  const [tab, setTab] = useScenarioTab()
  const [jump, setJump] = useState<RowJump>()
  const goToRow = (rowId: string) => {
    setTab('msel')
    setJump((j) => ({ rowId, n: (j?.n ?? 0) + 1 }))
  }
  const back = (
    <Link to={`/p/${projectKey(projectPath)}/scenarios`} className="back-link">
      <ArrowLeft size={14} aria-hidden /> All scenarios
    </Link>
  )
  if (query.isError) {
    return (
      <div className="page">
        {back}
        <p className="field__error" role="alert">
          Could not load this scenario: {errorText(query.error)}
        </p>
      </div>
    )
  }
  return (
    <div className="page page--wide scenario-page">
      {back}
      <PageHeader
        eyebrow="Scenario"
        title={scenario?.title ?? 'Loading…'}
        description={scenario?.subtitle}
        actions={
          scenario && (
            <HeaderActions projectPath={projectPath} scenario={scenario} readiness={readiness} />
          )
        }
      />
      {scenario && (
        <>
          {readiness && (
            <NextActionBar
              projectPath={projectPath}
              scenarioId={scenario.id}
              readiness={readiness}
              onShowTab={setTab}
              onJob={(id) => void follow(id)}
            />
          )}
          <ScenarioTabs
            projectPath={projectPath}
            scenario={scenario}
            onJob={(id) => void follow(id)}
            tab={tab}
            onTab={setTab}
            readiness={readiness}
            lintCount={lintCount}
            jump={jump}
            onGoToRow={goToRow}
          />
          <AdvancedInformation running={isActive(log)}>
            <StageTimeline
              projectPath={projectPath}
              scenarioId={scenarioId}
              provenance={scenario.provenance}
              busy={isActive(log)}
              onJob={(id) => void follow(id)}
              itemLabels={itemLabels(scenario)}
            />
            <LiveLogPanel log={log} itemLabels={itemLabels(scenario)} />
          </AdvancedInformation>
        </>
      )}
    </div>
  )
}

/**
 * Generation stages and the live log, collapsed under "Advanced information" at the bottom
 * of the page. It opens on its own while a generation job runs, so progress stays visible.
 */
function AdvancedInformation(props: { running: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <details
      className="advanced-info"
      open={open || props.running}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="advanced-info__summary">Advanced information</summary>
      <div className="scenario-page__status">{props.children}</div>
    </details>
  )
}

/** Phase and inject ids → readable labels for per-item stage runs. */
function itemLabels(scenario: Scenario): Record<string, string> {
  const injects = scenario.msel
    .filter((r) => r.injectId)
    .map((r) => [r.injectId!, `Inject ${r.id}`] as const)
  return { ...Object.fromEntries(injects), ...phaseLabels(scenario) }
}

/** Phase ids → "Phase 2: The Crisis" for per-phase stage runs and log streams. */
function phaseLabels(scenario: {
  phases: { id: string; index: number; title: string }[]
}): Record<string, string> {
  return Object.fromEntries(scenario.phases.map((p) => [p.id, `Phase ${p.index + 1}: ${p.title}`]))
}
