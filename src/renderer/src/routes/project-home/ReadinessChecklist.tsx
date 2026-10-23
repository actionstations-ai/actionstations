// "Get this exercise ready" (#226): six steps with live state from existing queries and one
// primary Next button pointing at the first step still to do.
import { ArrowRight, Check } from 'lucide-react'
import { Link } from 'react-router'
import type { Project } from '@shared/schemas'
import { Term } from '../../components/Glossary'
import { useIpcQuery } from '../../lib/query'
import { projectKey } from '../../state/project'
import { useReadiness } from '../scenarios/use-readiness'
import { buildChecklist, targetScenario, type ChecklistStep } from './checklist'

function useFactsCount(path: string, enabled: boolean): number | undefined {
  const facts = useIpcQuery('project:facility-facts', { path }, { enabled })
  if (!enabled || !facts.data) return undefined
  return facts.data.categories.reduce((n, c) => n + c.entries.length, 0)
}

function StepMarker({ step, index }: { step: ChecklistStep; index: number }) {
  return (
    <span className="checklist__marker" aria-hidden>
      {step.state === 'done' ? <Check size={16} /> : index + 1}
    </span>
  )
}

const STATE_TEXT = { done: '(done)', current: '(next step)', todo: '(to do)' } as const

export function ReadinessChecklist({ path, project }: { path: string; project: Project }) {
  const base = `/p/${projectKey(path)}`
  const target = targetScenario(project.scenarios)
  const scenario = useIpcQuery(
    'scenarios:get',
    { projectPath: path, scenarioId: target?.id ?? '' },
    { enabled: !!target },
  )
  const { readiness } = useReadiness(path, target ? scenario.data : undefined)
  const hasDocs = project.documents.some((d) => d.status === 'ok')
  const facts = useFactsCount(path, hasDocs)
  const steps = buildChecklist({
    project,
    facts,
    target,
    scenarioCount: project.scenarios.length,
    readiness,
  })
  const next = steps.find((s) => s.state === 'current')
  return (
    <section className="card checklist" aria-labelledby="checklist-heading">
      <div className="checklist__header">
        <div>
          <h2 id="checklist-heading">Get this exercise ready</h2>
          <p className="muted">
            Six steps from your documents to a printed exercise. Each one can be revisited and
            edited later.
          </p>
        </div>
        {next && (
          <Link className="btn btn--primary" to={`${base}/${next.to}`}>
            Next: {next.action.replace(/…$/, '')} <ArrowRight size={16} aria-hidden />
          </Link>
        )}
      </div>
      <ol className="checklist__steps">
        {steps.map((step, i) => (
          <li key={step.id} className="checklist__step" data-state={step.state}>
            <StepMarker step={step} index={i} />
            <div className="checklist__body">
              <h3 className="checklist__title">
                {step.title}
                <span className="sr-only"> {STATE_TEXT[step.state]}</span>
              </h3>
              <p className="muted">{step.detail}</p>
            </div>
            {step.state === 'current' ? (
              <span className="checklist__badge" aria-hidden>
                Next
              </span>
            ) : (
              <Link className="checklist__link" to={`${base}/${step.to}`}>
                {step.action}
              </Link>
            )}
          </li>
        ))}
      </ol>
      <p className="muted checklist__foot">
        New to exercise design? The <Term id="msel" /> is the exercise timeline, and each{' '}
        <Term id="inject">inject</Term> is one message the players receive. The Glossary button at
        the top explains the other terms.
      </p>
    </section>
  )
}
