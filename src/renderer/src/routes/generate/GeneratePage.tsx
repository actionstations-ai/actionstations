import { Tabs } from 'radix-ui'
import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import type { ScenarioIdea } from '@shared/schemas/scenario'
import { PageHeader } from '../../components/ui'
import { call, type IpcError } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey, projectKey } from '../../state/project'
import { BriefForm } from './BriefForm'
import { GenerateError } from './GenerateError'
import { IdeasPanel } from './IdeasPanel'
import {
  draftFromIdea,
  draftFromProposal,
  emptyDraft,
  toBrief,
  type BriefDraft,
} from './brief-form'
import { resolveProfile, type DomainProfile, type ThreatFamilyId } from '@shared/domains'
import { suggestThreat } from '../../lib/domains'
import '../scenarios/scenarios.css'
import './generate.css'

type Tab = 'prompt' | 'ideas'

function useStartScenario(projectPath: string) {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<IpcError | null>(null)
  const start = async (
    draft: BriefDraft,
    idea: ScenarioIdea | null,
    suggested: ThreatFamilyId | undefined,
  ) => {
    setSubmitting(true)
    setError(null)
    try {
      const { jobId, scenarioId } = await call('generate:scenario', {
        projectPath,
        brief: toBrief(draft, suggested),
        ...(idea ? { idea } : {}),
      })
      navigate(`/p/${projectKey(projectPath)}/scenarios/${scenarioId}`, { state: { jobId } })
    } catch (e) {
      setError(e as IpcError)
    } finally {
      setSubmitting(false)
    }
  }
  return { start, submitting, error }
}

export default function GeneratePage() {
  const projectPath = fromProjectKey(useParams().projectKey ?? '')
  const project = useIpcQuery('project:get', { path: projectPath }, { enabled: !!projectPath })
  const [tab, setTab] = useState<Tab>('prompt')
  const location = useLocation()
  const [draft, setDraft] = useState<BriefDraft>(() => draftFromProposal(location.state))
  const [idea, setIdea] = useState<ScenarioIdea | null>(null)
  const { start, submitting, error } = useStartScenario(projectPath)
  const roleSuggestions = (project.data?.project.defaultRoles ?? []).map((r) => r.name)
  const profile: DomainProfile | undefined = project.data
    ? resolveProfile(
        project.data.project.orgType,
        project.data.project.domainProfileOverrides,
        project.data.project.domainProfileSnapshot,
      )
    : undefined
  const suggestion = profile ? suggestThreat(profile, draft, idea) : undefined

  const develop = (chosen: ScenarioIdea) => {
    setIdea(chosen)
    setDraft((d) => draftFromIdea(chosen, d))
    setTab('prompt')
  }

  return (
    <div className="page generate-page">
      <PageHeader
        eyebrow="Project"
        title="Generate a scenario"
        description="Start from your own brief, or ask for ideas grounded in this project's documents. Every stage cites the plan sections it used."
      />
      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)} className="tabs">
        <Tabs.List className="tabs__list" aria-label="How to start">
          <Tabs.Trigger value="prompt" className="tabs__trigger">
            From a prompt
          </Tabs.Trigger>
          <Tabs.Trigger value="ideas" className="tabs__trigger">
            Give me ideas
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="prompt" className="tabs__panel stack">
          <BriefForm
            draft={draft}
            onChange={setDraft}
            onSubmit={(d) => void start(d, idea, suggestion?.id)}
            submitting={submitting}
            roleSuggestions={roleSuggestions}
            projectPath={projectPath}
            {...(profile && suggestion ? { profile, suggestion } : {})}
            {...(idea
              ? {
                  ideaTitle: idea.title,
                  onClearIdea: () => {
                    setIdea(null)
                    setDraft(emptyDraft())
                  },
                }
              : {})}
          />
          <GenerateError error={error} />
        </Tabs.Content>
        <Tabs.Content value="ideas" className="tabs__panel">
          <IdeasPanel
            projectPath={projectPath}
            onDevelop={develop}
            {...(profile ? { profile } : {})}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
