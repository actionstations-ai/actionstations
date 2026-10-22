// Name the provider task (and provider) a generation failure came from (#49 follow-up of #146).
// A job error such as "LM Studio unreachable…" did not say whether document search
// (Embeddings) or the text model failed, so the Generate screen blamed the text model. Errors
// are re-thrown as AppError with the same code and a "<Task> (<provider>): " prefix the
// renderer's error mapping understands.
import type { ProviderTask } from '@shared/schemas'
import { AppError, toAppError } from '../lib/errors'
import { getSettings } from '../settings/store'

export const TASK_LABELS: Record<ProviderTask, string> = {
  ideate: 'Ideation',
  draft: 'Drafting',
  critique: 'Critique',
  embed: 'Embeddings',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
}

const PREFIX = new RegExp(`^(?:${Object.values(TASK_LABELS).join('|')})(?: \\(|: )`)

/** The error re-labelled with its task; cancellations and already-labelled errors pass through. */
export function taskError(task: ProviderTask, err: unknown, provider?: string): unknown {
  if (err instanceof AppError && err.name !== 'AppError') return err
  const e = toAppError(err)
  if (e.code === 'CANCELLED' || PREFIX.test(e.message)) return e
  const who = provider ?? (task === 'embed' ? 'document search' : undefined)
  const details =
    e.details && typeof e.details === 'object' ? { ...e.details, task } : { task, cause: e.details }
  const label = who ? `${TASK_LABELS[task]} (${who})` : TASK_LABELS[task]
  return new AppError(e.code, `${label}: ${e.message}`, details)
}

/** The provider's label as the user named it in Providers; the id when it cannot be read. */
async function providerLabel(providerId: string): Promise<string> {
  try {
    return (await getSettings()).providers.find((p) => p.id === providerId)?.label ?? providerId
  } catch {
    return providerId
  }
}

/** Run fn; a failure is labelled with the task (and provider, by its label) it belongs to. */
export async function asTask<T>(
  task: ProviderTask,
  fn: () => Promise<T>,
  providerId?: string,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    throw taskError(task, err, providerId ? await providerLabel(providerId) : undefined)
  }
}
