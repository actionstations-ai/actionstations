// Prompt library API (#23). The prompt-library workstream implements these; the generation
// pipeline (#25) depends only on these signatures.
import type { PromptFile } from '@shared/schemas'
import { AppError } from '../lib/errors'

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
export async function loadPrompt(_name: string, _projectPath?: string): Promise<PromptFile> {
  throw new AppError('NOT_IMPLEMENTED', 'Prompt library lands with #23')
}

/** Render a prompt's Handlebars template with stage variables. */
export function renderPrompt(_prompt: PromptFile, _vars: Record<string, unknown>): RenderedPrompt {
  throw new AppError('NOT_IMPLEMENTED', 'Prompt library lands with #23')
}
