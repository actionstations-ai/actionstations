// index.sqlite is derived data (ADR-0003): duplicates, examples and folders from version
// control arrive without it. Opening such a project starts a rebuild from the copied
// documents (text.md is reused when it exists) so search and grounded generation work
// without the user having to find "Rebuild index".
import type { Job, Project } from '@shared/schemas'
import { rebuildIndex } from '../ingest/pipeline'
import { jobs } from '../jobs/manager'
import { exists } from '../lib/fs'
import { projectPaths } from './store'

/** Whether a project has ingested documents but no index file. */
export async function needsIndexRebuild(root: string, project: Project): Promise<boolean> {
  const ingested = project.documents.some((d) => d.status === 'ok')
  return ingested && !(await exists(projectPaths(root).index))
}

/** An index rebuild (ingest job with reset) already queued or running for this project. */
export function activeRebuild(root: string): Job | undefined {
  return jobs
    .list({ projectPath: root, activeOnly: true })
    .find((j) => j.kind === 'ingest' && (j.payload as { reset?: boolean } | undefined)?.reset)
}

/**
 * Start an index rebuild when one is needed; returns the job id, or null when none started.
 * Opening the project again while a rebuild runs reuses that job instead of starting a second
 * reset that would wipe the first one's chunks (#214).
 */
export function ensureIndex(root: string, project: Project): Promise<string | null> {
  // Two opens in the same tick share one check, so both cannot pass it before a job exists.
  const pending = starting.get(root)
  if (pending) return pending
  const run = startIfNeeded(root, project).finally(() => starting.delete(root))
  starting.set(root, run)
  return run
}

const starting = new Map<string, Promise<string | null>>()

async function startIfNeeded(root: string, project: Project): Promise<string | null> {
  if (!(await needsIndexRebuild(root, project))) return null
  const running = activeRebuild(root)
  if (running) return running.id
  return (await rebuildIndex(root)).id
}
