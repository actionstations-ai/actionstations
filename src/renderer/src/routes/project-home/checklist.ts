// The "Get this exercise ready" checklist (#226) as a pure function of what the project
// already reports: documents, facility facts, scenarios and the latest scenario's readiness.
import type { Project, ScenarioMeta } from '@shared/schemas/project'
import type { Readiness } from '../scenarios/readiness'

export type StepId = 'documents' | 'facts' | 'generate' | 'injects' | 'media' | 'run'
export type StepState = 'done' | 'current' | 'todo'

export interface ChecklistStep {
  id: StepId
  title: string
  detail: string
  state: StepState
  /** Route (relative to the project) and label of the step's action. */
  to: string
  action: string
}

export interface ChecklistInput {
  project: Pick<Project, 'documents'>
  /** Total facility facts, undefined while unknown (no documents yet, or loading). */
  facts: number | undefined
  /** The scenario the later steps follow (most recently updated, not archived). */
  target: ScenarioMeta | undefined
  scenarioCount: number
  readiness: Readiness | undefined
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Most recently updated scenario that is not archived. */
export function targetScenario(scenarios: readonly ScenarioMeta[]): ScenarioMeta | undefined {
  return [...scenarios]
    .filter((s) => s.status !== 'archived')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
}

function documentsStep(project: ChecklistInput['project']): Omit<ChecklistStep, 'state'> & {
  done: boolean
} {
  const docs = project.documents
  const ok = docs.filter((d) => d.status === 'ok').length
  const busy = docs.filter((d) => ['pending', 'parsing', 'embedding'].includes(d.status)).length
  const detail = !docs.length
    ? 'Import the plans, procedures and maps the exercise should draw on.'
    : `${plural(ok, 'document')} ready${busy ? `, ${busy} still indexing` : ''}.`
  return {
    id: 'documents',
    title: 'Add your documents',
    detail,
    done: ok > 0,
    to: 'documents',
    action: docs.length ? 'Open documents' : 'Import documents',
  }
}

function scenarioSteps(input: ChecklistInput) {
  const { target, readiness: r } = input
  const scenarioTo = target ? `scenarios/${target.id}?tab=injects` : 'scenarios'
  const name = target ? `“${target.title}”` : 'the scenario'
  return [
    {
      id: 'generate' as const,
      title: 'Generate a scenario',
      detail: input.scenarioCount
        ? `${plural(input.scenarioCount, 'scenario')} so far. Generate another any time.`
        : 'Describe a threat or ask for ideas; the timeline of events is written for you.',
      done: input.scenarioCount > 0,
      to: 'generate',
      action: input.scenarioCount ? 'New scenario' : 'Generate a scenario',
    },
    {
      id: 'injects' as const,
      title: 'Write the injects',
      detail: r
        ? `${r.written} of ${r.rows} events in ${name} have an inject.`
        : 'Each event in the timeline becomes a message, call or post for the players.',
      done: !!r && r.rows > 0 && r.written === r.rows,
      to: scenarioTo,
      action: 'Write injects',
    },
    {
      id: 'media' as const,
      title: 'Render the media',
      detail: r
        ? `${r.rendered} of ${r.rows} injects in ${name} are rendered.`
        : 'Turns each inject into the picture, document or audio players receive.',
      done: !!r && r.rows > 0 && r.rendered === r.rows,
      to: scenarioTo,
      action: 'Render media',
    },
    {
      id: 'run' as const,
      title: 'Export or facilitate',
      detail:
        r && r.errors
          ? `${plural(r.errors, 'check')} still report errors; you can export anyway.`
          : 'Print the handbook and inject deck, or run the exercise from the app.',
      done: false,
      to: target ? `scenarios/${target.id}/export` : 'scenarios',
      action: 'Export…',
    },
  ]
}

export function buildChecklist(input: ChecklistInput): ChecklistStep[] {
  const docs = documentsStep(input.project)
  const facts = {
    id: 'facts' as const,
    title: 'Check the facility facts',
    detail:
      input.facts === undefined
        ? 'Runways, gates, systems and other names found in your documents.'
        : `${plural(input.facts, 'fact')} found. Scenarios only use names on this list.`,
    done: docs.done && (input.facts ?? 0) > 0,
    to: 'facts',
    action: 'Review facts',
  }
  const raw = [docs, facts, ...scenarioSteps(input)]
  const current = raw.findIndex((s) => !s.done)
  return raw.map(({ done, ...s }, i) => ({
    ...s,
    state: done ? 'done' : i === current ? 'current' : 'todo',
  }))
}
