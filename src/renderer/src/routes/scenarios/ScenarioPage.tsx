import { Tabs } from 'radix-ui'
import { ArrowLeft } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router'
import type { Scenario } from '@shared/schemas/scenario'
import { Badge, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { isActive } from './live-log'
import { LiveLogPanel } from './LiveLogPanel'
import { MselTable } from './MselTable'
import { DocumentsTab, ObjectivesTab, OverviewTab, RubricTab } from '../../editors/docs'
import { WarningsSection } from './ScenarioSections'
import { StageTimeline } from './StageTimeline'
import { useLiveLog } from './use-live-log'
import './scenarios.css'

const STATUS_TONE = { draft: 'neutral', ready: 'ok', archived: 'warn' } as const

function ScenarioTabs(props: {
  projectPath: string
  scenario: Scenario
  onJob: (jobId: string) => void
}) {
  const { projectPath, scenario } = props
  const tabs = [
    ['overview', 'Overview'],
    ['objectives', 'Objectives & Roles'],
    ['msel', `MSEL (${scenario.msel.length})`],
    ['documents', 'Documents'],
    ['rubric', 'Rubric'],
    ['warnings', `Warnings (${scenario.warnings.length})`],
  ] as const
  return (
    <Tabs.Root defaultValue="overview" className="tabs">
      <Tabs.List className="tabs__list" aria-label="Scenario sections">
        {tabs.map(([value, label]) => (
          <Tabs.Trigger key={value} value={value} className="tabs__trigger">
            {label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      <Tabs.Content value="overview" className="tabs__panel">
        <OverviewTab {...props} />
      </Tabs.Content>
      <Tabs.Content value="objectives" className="tabs__panel">
        <ObjectivesTab {...props} />
      </Tabs.Content>
      <Tabs.Content value="msel" className="tabs__panel">
        <MselTable phases={scenario.phases} rows={scenario.msel} roles={scenario.roles} />
      </Tabs.Content>
      <Tabs.Content value="documents" className="tabs__panel">
        <DocumentsTab {...props} />
      </Tabs.Content>
      <Tabs.Content value="rubric" className="tabs__panel">
        <RubricTab {...props} />
      </Tabs.Content>
      <Tabs.Content value="warnings" className="tabs__panel">
        <WarningsSection projectPath={projectPath} scenarioId={scenario.id} />
      </Tabs.Content>
    </Tabs.Root>
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
          Could not load this scenario: {query.error.message}
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
        actions={scenario && <Badge tone={STATUS_TONE[scenario.status]}>{scenario.status}</Badge>}
      />
      {scenario && (
        <>
          <div className="scenario-page__status">
            <StageTimeline
              projectPath={projectPath}
              scenarioId={scenarioId}
              provenance={scenario.provenance}
              busy={isActive(log)}
              onJob={(id) => void follow(id)}
              itemLabels={phaseLabels(scenario)}
            />
            <LiveLogPanel log={log} itemLabels={phaseLabels(scenario)} />
          </div>
          <ScenarioTabs
            projectPath={projectPath}
            scenario={scenario}
            onJob={(id) => void follow(id)}
          />
        </>
      )}
    </div>
  )
}

/** Phase ids → "Phase 2: The Crisis" for per-phase stage runs and log streams. */
function phaseLabels(scenario: {
  phases: { id: string; index: number; title: string }[]
}): Record<string, string> {
  return Object.fromEntries(scenario.phases.map((p) => [p.id, `Phase ${p.index + 1}: ${p.title}`]))
}
