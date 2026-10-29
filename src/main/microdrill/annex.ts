// The annex of a micro-drill (#437, FR-1): one heading of one document and everything under it,
// read from the index's chunks in reading order. A section too large for one drill is refused so
// the model never sees a cut-off annex.
import { MICRO_DRILL_LIMITS, type Chunk } from '@shared/schemas'
import { normalizedForm } from '@shared/redline/excerpt'
import { pipelineDeps } from '../generate/deps'
import { AppError } from '../lib/errors'

export interface ChunkSource {
  chunks(documentId: string, limit?: number, offset?: number): Chunk[]
}

/** The project's index, as far as a drill needs it (the pipeline's index, so tests can fake it). */
export async function openChunks(root: string): Promise<ChunkSource> {
  return (await (await pipelineDeps()).openIndex(root)) as unknown as ChunkSource
}

export interface AnnexOption {
  headingPath: string
  tokens: number
  page?: number
  /** Over the size limit: pick a narrower section. */
  tooLarge: boolean
}

export interface Annex {
  headingPath: string
  chunks: Chunk[]
  tokens: number
  page?: number
}

const MAX_CHUNKS = 5000
const SEPARATOR = ' › '

const same = (a: string, b: string): boolean => normalizedForm(a) === normalizedForm(b)
const within = (path: string, parent: string): boolean =>
  normalizedForm(path).startsWith(`${normalizedForm(parent)}${SEPARATOR}`)

/** True when the chunk's heading is the annex heading or sits under it. */
export const inAnnex = (chunkPath: string, headingPath: string): boolean =>
  same(chunkPath, headingPath) || within(chunkPath, headingPath)

const ancestors = (path: string): string[] => {
  const parts = path.split(/\s+›\s+/)
  return parts.map((_, i) => parts.slice(0, i + 1).join(SEPARATOR))
}

function readAll(index: ChunkSource, documentId: string): Chunk[] {
  return [...index.chunks(documentId, MAX_CHUNKS, 0)].sort((a, b) => a.ord - b.ord || a.id - b.id)
}

/** Every heading of the document that holds text, with the size of the section under it. */
export function listAnnexes(index: ChunkSource, documentId: string): AnnexOption[] {
  const all = readAll(index, documentId)
  const paths = new Map<string, AnnexOption>()
  for (const c of all)
    for (const path of ancestors(c.headingPath)) {
      if (!paths.has(path)) paths.set(path, { headingPath: path, tokens: 0, tooLarge: false })
    }
  const deeper = [...paths.keys()].some((p) => p.includes(SEPARATOR))
  const out: AnnexOption[] = []
  for (const option of paths.values()) {
    if (deeper && !option.headingPath.includes(SEPARATOR)) continue
    const mine = all.filter((c) => inAnnex(c.headingPath, option.headingPath))
    const tokens = mine.reduce((n, c) => n + c.tokenCount, 0)
    const page = mine.find((c) => c.page !== undefined)?.page
    out.push({
      ...option,
      tokens,
      tooLarge: tokens > MICRO_DRILL_LIMITS.annexTokens,
      ...(page !== undefined ? { page } : {}),
    })
  }
  return out
}

/** The chunks of one annex; refuses an unknown heading and a section over the size limit. */
export function readAnnex(index: ChunkSource, documentId: string, headingPath: string): Annex {
  const chunks = readAll(index, documentId).filter((c) => inAnnex(c.headingPath, headingPath))
  if (!chunks.length)
    throw new AppError('NOT_FOUND', 'That section is not in the index. Import the plan again.')
  const tokens = chunks.reduce((n, c) => n + c.tokenCount, 0)
  if (tokens > MICRO_DRILL_LIMITS.annexTokens)
    throw new AppError(
      'VALIDATION',
      `That section is about ${tokens.toLocaleString('en-US')} tokens; a drill takes up to ${MICRO_DRILL_LIMITS.annexTokens.toLocaleString('en-US')}. Pick a narrower section.`,
    )
  const page = chunks.find((c) => c.page !== undefined)?.page
  return { headingPath, chunks, tokens, ...(page !== undefined ? { page } : {}) }
}
