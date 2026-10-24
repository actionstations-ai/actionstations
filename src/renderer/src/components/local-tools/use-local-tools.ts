// Data hooks for the local tools rows (ADR-0021, #334). Status is read only while a local or
// mixed setup is shown; installs and model pulls are jobs started from a click.
import type { JobKind } from '@shared/schemas/job'
import type { HardwareView, OllamaAddonId, SetupSettings, ToolId } from '@shared/schemas/setup'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { latestJob, trackJob, useJobsStore, type TrackedJob } from '../../state/jobs'
import { useJobsConnection } from '../../state/use-jobs'
import { toast } from '../toast-store'

export function useSetupStatus(enabled: boolean) {
  return useIpcQuery('setup:status', undefined, { enabled, staleTime: 30_000 })
}

const keyOf = (j: TrackedJob): string | undefined =>
  (j.payload as { key?: unknown } | undefined)?.key as string | undefined

/** The newest install or pull job for one tool or model, started from any screen. */
export function useKeyedJob(kind: JobKind, key: string): TrackedJob | null {
  useJobsConnection()
  return useJobsStore((s) => latestJob(s.jobs, (j) => j.kind === kind && keyOf(j) === key))
}

export const toolKey = (tool: ToolId): string => `tool:${tool}`
export const modelKey = (modelId: string): string => `model:${modelId}`

export async function startInstall(tool: ToolId, addons: OllamaAddonId[] = []): Promise<void> {
  try {
    const { jobId } = await call('setup:install', { tool, ...(addons.length ? { addons } : {}) })
    trackJob(jobId, { kind: 'tool-install', payload: { key: toolKey(tool), tool } })
  } catch (err) {
    toast.error('Could not start the install', err)
  }
}

export async function startPull(modelId: string): Promise<void> {
  try {
    const { jobId } = await call('setup:pull-model', { modelId })
    trackJob(jobId, { kind: 'model-pull', payload: { key: modelKey(modelId), modelId } })
  } catch (err) {
    toast.error('Could not start the download', err)
  }
}

/** Save part of settings.setup (mode or skipped tools). */
export async function saveSetup(patch: Partial<SetupSettings>): Promise<void> {
  await call('settings:update', { setup: patch })
  await queryClient.invalidateQueries({ queryKey: ['settings:get'] })
}

export function formatSize(bytes: number): string {
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

export function hardwareSummary(hw: HardwareView): string {
  const ram = `${Math.round(hw.ramBytes / 2 ** 30)} GB RAM`
  const gpu = hw.appleSilicon
    ? 'Apple Silicon (shared memory)'
    : hw.gpuName
      ? `${hw.gpuName}, ${Math.round((hw.vramBytes ?? 0) / 2 ** 30)} GB VRAM`
      : 'no supported GPU found: models run on the CPU'
  return `${ram} · ${gpu}`
}
