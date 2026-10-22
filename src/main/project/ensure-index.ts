// index.sqlite is derived data (ADR-0003): duplicates, examples and folders from version
// control arrive without it. Opening such a project starts a rebuild from the copied
// documents (text.md is reused when it exists) so search and grounded generation work
// without the user having to find "Rebuild index".
import type { Project } from '@shared/schemas'
import { rebuildIndex } from '../ingest/pipeline'
import { exists } from '../lib/fs'
import { projectPaths } from './store'

/** Whether a project has ingested documents but no index file. */
export async function needsIndexRebuild(root: string, project: Project): Promise<boolean> {
  const ingested = project.documents.some((d) => d.status === 'ok')
  return ingested && !(await exists(projectPaths(root).index))
}

/** Start an index rebuild when one is needed; returns the job id, or null when none started. */
export async function ensureIndex(root: string, project: Project): Promise<string | null> {
  if (!(await needsIndexRebuild(root, project))) return null
  return (await rebuildIndex(root)).id
}
