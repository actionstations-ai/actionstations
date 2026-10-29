// Citations of a drill after the plan changed (#431, FR-9): a citation of the old plan is
// pointed at the same heading of the plan that replaces it. A heading that no longer exists
// keeps its old citation and gets a CITATION_MOVED warning naming the nearest heading.
import type { Chunk, Citation, DocumentMeta, LintWarning } from '@shared/schemas'
import { normalizedForm } from '@shared/redline/excerpt'

export const CITATION_MOVED = 'CITATION_MOVED'

export interface Resolved {
  citations: Citation[]
  warnings: LintWarning[]
}

/** old document id → the newest document that replaces it (chains followed, cycles refused). */
export function supersessionMap(documents: readonly DocumentMeta[]): Map<string, DocumentMeta> {
  const newerOf = new Map<string, DocumentMeta>()
  for (const d of documents) if (d.supersedesDocumentId) newerOf.set(d.supersedesDocumentId, d)
  const out = new Map<string, DocumentMeta>()
  for (const id of newerOf.keys()) {
    let latest = newerOf.get(id)!
    const seen = new Set([id])
    while (newerOf.has(latest.id) && !seen.has(latest.id)) {
      seen.add(latest.id)
      latest = newerOf.get(latest.id)!
    }
    out.set(id, latest)
  }
  return out
}

const words = (s: string): Set<string> =>
  new Set(
    normalizedForm(s)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  )

/** The heading of `chunks` closest to `path` by shared words of its last segment, if any. */
export function nearestHeading(chunks: readonly Chunk[], path: string): string | undefined {
  const want = words(path.split('›').at(-1) ?? path)
  let best: { heading: string; score: number } | undefined
  for (const h of new Set(chunks.map((c) => c.headingPath))) {
    const have = words(h.split('›').at(-1) ?? h)
    const shared = [...want].filter((w) => have.has(w)).length
    const score = shared / Math.max(1, new Set([...want, ...have]).size)
    if (shared && (!best || score > best.score)) best = { heading: h, score }
  }
  return best?.heading
}

export function reresolveCitations(
  citations: readonly Citation[],
  supersedes: ReadonlyMap<string, DocumentMeta>,
  chunksOf: (documentId: string) => readonly Chunk[],
  rowId?: string,
): Resolved {
  const out: Citation[] = []
  const warnings: LintWarning[] = []
  for (const c of citations) {
    const next = supersedes.get(c.documentId)
    if (!next) {
      out.push(c)
      continue
    }
    const chunks = chunksOf(next.id)
    const hit = chunks.find((k) => normalizedForm(k.headingPath) === normalizedForm(c.headingPath))
    if (hit) {
      const { quote: _quote, ...rest } = c
      out.push({
        ...rest,
        documentId: next.id,
        documentTitle: next.title,
        chunkId: hit.id,
        ...(hit.page !== undefined ? { page: hit.page } : {}),
      })
      continue
    }
    out.push(c)
    const near = nearestHeading(chunks, c.headingPath)
    warnings.push({
      code: CITATION_MOVED,
      severity: 'warning',
      message: `${c.headingPath} is not in ${next.title}; the citation still points at the earlier version.`,
      source: 'lint',
      ...(rowId ? { rowId } : {}),
      ...(near ? { suggestion: near } : {}),
    })
  }
  return { citations: out, warnings }
}
