// Heading paths for a program snapshot (#504, #438): every distinct heading of a document down
// to depth 3, not just the first sixty of the ingest preview, so the health dashboard can tell
// a plan section that was never cited from one that was never listed.
import { pathSegments } from '@shared/program/health-sections'

export const SNAPSHOT_SECTION_DEPTH = 3
export const MAX_SNAPSHOT_SECTIONS = 400
const SEPARATOR = ' › '

/**
 * Distinct heading paths (without the document's short name), each ancestor before its
 * descendants, cut to `depth` segments and to `max` paths in all.
 */
export function snapshotSections(
  chunkPaths: readonly string[],
  names: { shortName?: string; title?: string },
  depth = SNAPSHOT_SECTION_DEPTH,
  max = MAX_SNAPSHOT_SECTIONS,
): string[] {
  const seen = new Set<string>()
  for (const path of chunkPaths) {
    const segments = pathSegments(path, names).slice(0, depth)
    for (let n = 1; n <= segments.length; n++) {
      seen.add(segments.slice(0, n).join(SEPARATOR))
      if (seen.size >= max) return [...seen]
    }
  }
  return [...seen]
}
