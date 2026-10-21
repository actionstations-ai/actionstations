// Prompt library API (#23). The generation pipeline (#25) depends only on loadPrompt,
// renderPrompt and RenderedPrompt; the IPC handlers use the library functions re-exported below.
import type { PromptFile } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { hashRaw, splitSections } from './format'
import { assertPromptName } from './layers'
import { hashOfLoaded, loadEffectivePrompt } from './library'
import { compileTemplate, type CompiledTemplate } from './template'

export { getPromptLayers, listPrompts, resetPromptOverride, savePromptOverride } from './library'

/** A prompt rendered with its variables, ready to send. */
export interface RenderedPrompt {
  name: string
  /** System instructions (role, rules, output contract). */
  system: string
  /** User turn (task + data). */
  user: string
  /** Large, stable context (retrieved doctrine) the adapter may cache. */
  cacheableContext?: string
  /** sha256 of the effective prompt source, recorded in StageRun.promptHash. */
  hash: string
  frontmatter: PromptFile['frontmatter']
}

/** Effective prompt for a stage: project override > global override > shipped default. */
export async function loadPrompt(name: string, projectPath?: string): Promise<PromptFile> {
  return loadEffectivePrompt(assertPromptName(name), projectPath)
}

interface CompiledPrompt {
  system: CompiledTemplate
  user: CompiledTemplate
  context?: CompiledTemplate
}

const compiledByHash = new Map<string, CompiledPrompt>()

/** Hash of a PromptFile that loadPrompt did not produce (built in code or sent over IPC). */
const canonicalHash = (p: PromptFile): string =>
  hashRaw(JSON.stringify({ frontmatter: p.frontmatter, body: p.body }))

function compiledFor(prompt: PromptFile, hash: string): CompiledPrompt {
  const hit = compiledByHash.get(hash)
  if (hit) return hit
  const sections = splitSections(prompt.body)
  if (!sections.system?.text || !sections.user?.text)
    throw new AppError('VALIDATION', `Prompt ${prompt.name} needs @system and @user sections`)
  const compiled: CompiledPrompt = {
    system: compileTemplate(sections.system.text),
    user: compileTemplate(sections.user.text),
    ...(sections.context?.text ? { context: compileTemplate(sections.context.text) } : {}),
  }
  compiledByHash.set(hash, compiled)
  return compiled
}

/** Render a prompt's Handlebars template with stage variables. */
export function renderPrompt(prompt: PromptFile, vars: Record<string, unknown>): RenderedPrompt {
  const hash = hashOfLoaded(prompt) ?? canonicalHash(prompt)
  const compiled = compiledFor(prompt, hash)
  const context = compiled.context?.(vars).trim()
  return {
    name: prompt.name,
    system: compiled.system(vars).trim(),
    user: compiled.user(vars).trim(),
    ...(context ? { cacheableContext: context } : {}),
    hash,
    frontmatter: prompt.frontmatter,
  }
}
