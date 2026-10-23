// Deck-wide jobs: "Write all injects" and "Render all media".
import type { JobKind } from '@shared/schemas/job'
import { toast } from '../../components/toast-store'
import { call, IpcError } from '../../lib/api'

export function useDeckJobs(
  projectPath: string,
  scenarioId: string,
  track: (id: string, k: JobKind) => void,
  onJob: ((jobId: string) => void) | undefined,
) {
  const start = async (kind: JobKind, run: () => Promise<{ jobId: string }>) => {
    try {
      const { jobId } = await run()
      track(jobId, kind)
      onJob?.(jobId)
    } catch (e) {
      const conflict = e instanceof IpcError && e.code === 'CONFLICT'
      toast.error(
        conflict ? 'A generation job is already running for this scenario' : 'Could not start',
        e,
      )
    }
  }
  return {
    writeAll: () =>
      start('generate-injects', () => call('generate:injects', { projectPath, scenarioId })),
    renderAll: () =>
      start('render-media', () => call('generate:media', { projectPath, scenarioId })),
  }
}
