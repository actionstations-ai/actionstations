// Ids the app ships, which pack items may shadow (templates, prompts, workflows, examples)
// or must name (prompts). Read from the resources folder through the existing loaders.
import { promises as fs } from 'node:fs'
import { listExamples } from '../examples/catalog'
import { resourcePath } from '../lib/paths'
import { listDefaultNames } from '../prompts/layers'
import { listBuiltinTemplateTypes } from '../render/templates'

export interface PackBuiltins {
  templates: readonly string[]
  /** Shipped prompt names: a pack prompt must use one of them. */
  prompts: readonly string[]
  workflows: readonly string[]
  examples: readonly string[]
}

async function builtinWorkflowIds(): Promise<string[]> {
  const names = await fs.readdir(resourcePath('comfy', 'workflows')).catch(() => [] as string[])
  return names
    .filter((n) => n.endsWith('.json') && !n.endsWith('.bindings.json'))
    .map((n) => n.slice(0, -'.json'.length))
}

export async function loadBuiltins(): Promise<PackBuiltins> {
  const [prompts, workflows, examples] = await Promise.all([
    listDefaultNames(),
    builtinWorkflowIds(),
    listExamples().catch(() => []),
  ])
  return {
    templates: listBuiltinTemplateTypes(),
    prompts,
    workflows,
    examples: examples.map((e) => e.slug),
  }
}
