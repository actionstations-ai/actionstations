// Everything the pipeline needs from other workstreams, behind one injectable object so the
// engine runs offline in tests (fake store, fake index, mock provider, test prompt renderer)
// and against the real modules in the app.
import type { Project, PromptFile, ProviderTask, Scenario, ScenarioDocKind } from '@shared/schemas'
import type { IndexStore } from '../retrieve/types'
import type { RenderedPrompt } from '../prompts'
import type { ResolvedText } from '../providers/resolve'
import type { SaveOptions } from '../scenario/store'
import type { FacilityFacts } from './facility'

export type TextTask = Extract<ProviderTask, 'ideate' | 'draft' | 'critique'>

export interface ScenarioStoreDeps {
  createScenario(
    projectPath: string,
    init: { title: string; brief: Scenario['brief'] },
  ): Promise<Scenario>
  getScenario(projectPath: string, scenarioId: string): Promise<Scenario>
  saveScenario(projectPath: string, scenario: Scenario, opts: SaveOptions): Promise<Scenario>
  readScenarioDoc(projectPath: string, scenarioId: string, kind: ScenarioDocKind): Promise<string>
  writeScenarioDoc(
    projectPath: string,
    scenarioId: string,
    kind: ScenarioDocKind,
    markdown: string,
    opts: SaveOptions,
  ): Promise<void>
}

export type SearchIndex = Pick<IndexStore, 'search' | 'chunk'>

export interface PipelineDeps {
  loadPrompt(name: string, projectPath?: string): Promise<PromptFile>
  renderPrompt(prompt: PromptFile, vars: Record<string, unknown>): RenderedPrompt
  resolveTextProvider(task: TextTask, projectPath?: string): Promise<ResolvedText>
  openIndex(projectPath: string): Promise<SearchIndex>
  loadProject(projectPath: string): Promise<Project>
  /** Facility identifiers the project's documents state (#84). */
  loadFacilityFacts(projectPath: string, project: Project): Promise<FacilityFacts>
  store: ScenarioStoreDeps
}

let overrides: Partial<PipelineDeps> = {}

/** Tests inject fakes here; `undefined` restores the real modules. */
export function setPipelineDeps(deps: Partial<PipelineDeps> | undefined): void {
  overrides = deps ?? {}
}

/** Real modules are imported lazily and only for the keys a test did not override. */
async function realDeps(missing: (keyof PipelineDeps)[]): Promise<Partial<PipelineDeps>> {
  const out: Partial<PipelineDeps> = {}
  const need = (k: keyof PipelineDeps): boolean => missing.includes(k)
  if (need('loadPrompt') || need('renderPrompt')) {
    const m = await import('../prompts')
    out.loadPrompt = m.loadPrompt
    out.renderPrompt = m.renderPrompt
  }
  if (need('resolveTextProvider')) {
    out.resolveTextProvider = (await import('../providers/resolve')).resolveTextProvider
  }
  if (need('openIndex')) out.openIndex = (await import('../retrieve')).openIndex
  if (need('loadProject')) out.loadProject = (await import('../project/store')).loadProject
  if (need('loadFacilityFacts'))
    out.loadFacilityFacts = (await import('./facility')).loadFacilityFacts
  if (need('store')) out.store = await import('../scenario/store')
  return out
}

const KEYS: (keyof PipelineDeps)[] = [
  'loadPrompt',
  'renderPrompt',
  'resolveTextProvider',
  'openIndex',
  'loadProject',
  'loadFacilityFacts',
  'store',
]

export async function pipelineDeps(): Promise<PipelineDeps> {
  const missing = KEYS.filter((k) => overrides[k] === undefined)
  const real = await realDeps(missing)
  return { ...real, ...overrides } as PipelineDeps
}
