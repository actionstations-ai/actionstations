// A proposal written by hand from selected plan text (#431, FR-3). The renderer only says which
// document, section and words; everything else comes from the project, and the words must be in
// the section the way the index holds them, as for a drafted proposal.
import { findExcerpt } from '@shared/redline/excerpt'
import type { NewRedline, Redline } from '@shared/schemas'
import { pipelineDeps } from '../generate/deps'
import { loadMeta } from '../ingest/storage'
import { AppError } from '../lib/errors'
import { loadProject } from '../project/store'
import { getScenario } from '../scenario/store'
import { sectionText, type ChunkSource } from './section-text'
import { sourceKindOf } from './stage'
import { createRedline } from './store'

export async function createManualRedline(root: string, input: NewRedline): Promise<Redline> {
  const [doc, scenario, project, deps] = await Promise.all([
    loadMeta(root, input.target.documentId),
    getScenario(root, input.source.scenarioId),
    loadProject(root),
    pipelineDeps(),
  ])
  const index = (await deps.openIndex(root)) as unknown as ChunkSource
  const section = sectionText(index, doc.id, input.target.headingPath)
  const span = section ? findExcerpt(section.text, input.originalExcerpt) : null
  if (!section || !span)
    throw new AppError(
      'VALIDATION',
      `That text is not in the section "${input.target.headingPath}" of ${doc.title}.`,
    )
  return createRedline(
    root,
    {
      ...input,
      projectId: project.id,
      source: { ...input.source, scenarioTitle: scenario.title },
      target: {
        ...input.target,
        documentTitle: doc.title,
        ...(doc.sha256 ? { documentSha256: doc.sha256 } : {}),
        ...(section.page !== undefined ? { page: section.page } : {}),
        sourceKind: sourceKindOf(doc),
      },
      originalExcerpt: section.text.slice(span.start, span.end),
    },
    'user',
  )
}
