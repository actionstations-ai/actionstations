// Paid media confirmation: before a media batch starts, count the calls it will make to each
// remote media provider and ask the user to continue. Local providers never ask. The counting
// and the decision are pure; the ask goes to the renderer as media:confirm-needed and is
// answered over media:confirm-answer. "Don't ask again" is stored per provider in settings.
import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import type { MediaConfirmNeededEvent, MediaConfirmProvider } from '@shared/ipc/media-confirm'
import { providerHost, isRemoteProvider } from '@shared/provider-network'
import type { Inject, MediaBrief, ProviderConfig } from '@shared/schemas'
import type { RenderPath } from '@shared/taxonomy'
import { AppError } from '../../lib/errors'
import { emit } from '../../lib/events'
import { getSettings, updateSettings } from '../../settings/store'
import type { MediaTask } from './deps'

const TASK_OF_PATH: Partial<Record<RenderPath, MediaTask>> = {
  ai_image: 'image',
  tts: 'audio',
  ai_video: 'video',
}

/** The media tasks one inject's render will call: the brief's paths, narrowed to `only`. */
export function tasksForInject(brief: MediaBrief | undefined, only?: RenderPath[]): MediaTask[] {
  const paths = brief ? (only ? brief.paths.filter((p) => only.includes(p)) : brief.paths) : only
  return (paths ?? []).flatMap((p) => TASK_OF_PATH[p] ?? [])
}

/** Every call a batch plans, from the stored briefs (an inject without a brief counts `only`). */
export function plannedTasks(injects: Inject[], only?: RenderPath[]): MediaTask[] {
  return injects.flatMap((i) => tasksForInject(i.mediaBrief, only))
}

export type PaidTargets = Partial<Record<MediaTask, ProviderConfig>>

/** A paid media provider is remote (it leaves the computer) and serves media. */
export const isPaidMedia = (config: ProviderConfig): boolean => isRemoteProvider(config)

function priceOf(config: ProviderConfig, task: MediaTask): number | undefined {
  const pick = (key: string): number | undefined => {
    const v = config.options[key]
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
  }
  return pick(`${task}UsdPerCall`) ?? pick('mediaUsdPerCall')
}

const cents = (usd: number): number => Math.round(usd * 100) / 100

/**
 * Calls per paid provider. `targets` maps each task to the provider routed to it; local
 * providers and tasks without a provider are left out. The estimate is present only when every
 * planned call of that provider has a price.
 */
export function countPaidCalls(tasks: MediaTask[], targets: PaidTargets): MediaConfirmProvider[] {
  const byProvider = new Map<string, MediaConfirmProvider & { priced: boolean; sum: number }>()
  for (const task of tasks) {
    const config = targets[task]
    if (!config || !isPaidMedia(config)) continue
    let entry = byProvider.get(config.id)
    if (!entry) {
      entry = {
        providerId: config.id,
        label: config.label,
        host: providerHost(config),
        counts: { image: 0, video: 0, audio: 0 },
        priced: true,
        sum: 0,
      }
      byProvider.set(config.id, entry)
    }
    entry.counts[task] += 1
    const price = priceOf(config, task)
    if (price === undefined) entry.priced = false
    else entry.sum += price
  }
  return [...byProvider.values()].map(({ priced, sum, ...p }) => ({
    ...p,
    ...(priced ? { estimateUsd: cents(sum) } : {}),
  }))
}

/** The providers the user still has to be asked about. */
export function providersToAsk(
  providers: MediaConfirmProvider[],
  skip: readonly string[],
): MediaConfirmProvider[] {
  return providers.filter((p) => !skip.includes(p.providerId))
}

export function totalEstimate(providers: MediaConfirmProvider[]): number | undefined {
  if (!providers.length || providers.some((p) => p.estimateUsd === undefined)) return undefined
  return cents(providers.reduce((n, p) => n + (p.estimateUsd ?? 0), 0))
}

// ---- asking the renderer ---------------------------------------------------------------------

interface Answer {
  decision: 'continue' | 'cancel'
  dontAskAgain: string[]
}
const waiting = new Map<string, (a: Answer) => void>()

/** The renderer's answer (media:confirm-answer). An unknown request id is ignored. */
export function answerMediaConfirm(requestId: string, answer: Answer): void {
  waiting.get(requestId)?.(answer)
}

function ask(event: MediaConfirmNeededEvent, signal?: AbortSignal): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const cancelled = (): AppError => new AppError('CANCELLED', 'Cancelled before media started')
    if (signal?.aborted) return reject(cancelled())
    const done = (): void => {
      waiting.delete(event.requestId)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = (): void => {
      done()
      reject(cancelled())
    }
    signal?.addEventListener('abort', onAbort)
    waiting.set(event.requestId, (a) => {
      done()
      resolve(a)
    })
    emit('media:confirm-needed', event)
  })
}

/**
 * Ask before a batch calls paid providers. Resolves when the user continues (or nothing needs
 * asking); throws CANCELLED when they cancel. "Don't ask again" ticks are saved in settings.
 */
export async function confirmPaidMedia(
  providers: MediaConfirmProvider[],
  signal?: AbortSignal,
): Promise<void> {
  if (!providers.length) return
  const settings = await getSettings()
  const pending = providersToAsk(providers, settings.media.skipPaidConfirmation)
  if (!pending.length) return
  if (!BrowserWindow.getAllWindows().length)
    throw new AppError(
      'VALIDATION',
      'Paid media needs your confirmation, but no app window is open to ask.',
    )
  const total = totalEstimate(pending)
  const answer = await ask(
    {
      requestId: randomUUID(),
      providers: pending,
      ...(total !== undefined ? { totalEstimateUsd: total } : {}),
    },
    signal,
  )
  if (answer.decision === 'cancel') throw new AppError('CANCELLED', 'Media generation cancelled')
  const known = new Set(pending.map((p) => p.providerId))
  const skip = answer.dontAskAgain.filter((id) => known.has(id))
  if (skip.length)
    await updateSettings((s) => {
      s.media.skipPaidConfirmation = [...new Set([...s.media.skipPaidConfirmation, ...skip])]
    })
}
