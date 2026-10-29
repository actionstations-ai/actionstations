// "Create personas from SimCell scripts" with the model's help (spec 0429 FR-3). The result is a
// proposal for the designer to review; nothing is saved here.
import { PersonasOutput, type PersonasFile } from '@shared/schemas'
import { baseVars } from '../generate/vars'
import type { JobContext } from '../jobs/manager'
import { loadProject } from '../project/store'
import { loadPrompt, renderPrompt } from '../prompts'
import { resolveTextProvider } from '../providers/resolve'
import { getScenario } from '../scenario/store'
import { chatJson } from './draft'
import { mergeGenerated } from './personas'

const MAX_ROWS = 60

export async function proposePersonas(
  root: string,
  scenarioId: string,
  ctx: JobContext,
): Promise<PersonasFile> {
  const [project, scenario] = await Promise.all([loadProject(root), getScenario(root, scenarioId)])
  ctx.progress(0.1, 'Filling in persona cards')
  const base = baseVars({ project, scenario })
  const vars = {
    ...base,
    scripts: scenario.simcellScripts.map((s, index) => ({ index, ...s })),
    rows: scenario.msel
      .slice(0, MAX_ROWS)
      .map((r) => ({ time: r.time, from: r.from, event: r.event.slice(0, 300) })),
  }
  const [prompt, resolved] = await Promise.all([
    loadPrompt('simcell_personas', root),
    resolveTextProvider('draft', root),
  ])
  ctx.throwIfCancelled()
  const { output } = await chatJson({
    provider: resolved.provider,
    model: resolved.model,
    rendered: renderPrompt(prompt, vars),
    name: 'PersonasOutput',
    schema: PersonasOutput,
    task: 'draft',
    stage: 'simcell_personas',
    projectPath: root,
    signal: ctx.signal,
  })
  ctx.progress(1, 'Persona cards ready to review')
  return mergeGenerated(output, scenario)
}
