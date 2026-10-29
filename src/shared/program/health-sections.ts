// Plan-section coverage for the health dashboard (#438, FR-5). Sections are matched by their
// heading path after the document short name, normalized, so the same plan ingested into two
// projects (different spacing, different short name) lands on the same row. A citation deeper
// than depth 3 counts toward its depth-3 ancestor, and every citation counts toward its
// shallower ancestors too, so a cited "13.6" also marks "Section 13" as exercised.
import type { PlanSectionRef, ProjectSnapshot } from '../schemas/program'
import type { ExerciseRef, SectionHealth } from '../schemas/program-health'

export const SECTION_DEPTH = 3
const SEPARATOR = ' › '

/** Lower-case, collapse whitespace, drop punctuation except ".", trim trailing dots. */
export function normalizeHeading(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.+$/, '')
}

const splitPath = (path: string): string[] =>
  path
    .split(/\s*[›>]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)

type SnapshotDoc = ProjectSnapshot['documents'][number]

export const documentKey = (doc: Pick<SnapshotDoc, 'sha256' | 'title'>): string =>
  doc.sha256 || normalizeHeading(doc.title)

/** Heading segments after the short name (or title) that `buildHeadingPath` puts first. */
export function pathSegments(
  headingPath: string,
  names: { shortName?: string; title?: string },
): string[] {
  const parts = splitPath(headingPath)
  const first = parts[0] ? normalizeHeading(parts[0]) : ''
  const matches = (name?: string): boolean => !!name && first === normalizeHeading(name)
  return first && (matches(names.shortName) || matches(names.title)) ? parts.slice(1) : parts
}

export interface DocIndex {
  /** Documents by `<projectId>|<documentId>`. */
  byId: Map<string, { key: string; doc: SnapshotDoc }>
  /** Documents deduplicated across projects by `documentKey`. */
  docs: Map<string, { key: string; doc: SnapshotDoc; projectNames: Set<string> }>
}

export function indexDocuments(snapshots: ProjectSnapshot[]): DocIndex {
  const byId: DocIndex['byId'] = new Map()
  const docs: DocIndex['docs'] = new Map()
  for (const snap of snapshots)
    for (const doc of snap.documents) {
      const key = documentKey(doc)
      byId.set(`${snap.projectId}|${doc.id}`, { key, doc })
      const entry = docs.get(key) ?? { key, doc, projectNames: new Set<string>() }
      entry.projectNames.add(snap.name)
      docs.set(key, entry)
    }
  return { byId, docs }
}

/** The document key and heading segments a plan-section reference names. */
export function resolveRef(
  index: DocIndex,
  projectId: string | undefined,
  ref: PlanSectionRef,
): { key: string; segments: string[] } {
  const known = projectId ? index.byId.get(`${projectId}|${ref.documentId}`) : undefined
  const key = known?.key ?? ref.documentSha256 ?? normalizeHeading(ref.documentTitle)
  const names = { shortName: known?.doc.shortName, title: known?.doc.title ?? ref.documentTitle }
  return { key, segments: pathSegments(ref.headingPath, names) }
}

const rowId = (key: string, segments: string[]): string =>
  `${key}\u0000${segments.map(normalizeHeading).join('\u0001')}`

const prefixes = (segments: string[]): string[][] =>
  Array.from({ length: Math.min(segments.length, SECTION_DEPTH) }, (_, i) =>
    segments.slice(0, i + 1),
  )

interface Row {
  health: SectionHealth
  seen: Set<string>
}

export interface SectionBuilder {
  /** Add a section that exists in a document, cited or not. */
  declare(key: string, segments: string[]): void
  /** Record that an exercised scenario cited the path. */
  cite(key: string, segments: string[], exercise: ExerciseRef): void
  /** Count an open corrective action against the path and its ancestors. */
  addAction(key: string, segments: string[]): void
  rows(): SectionHealth[]
}

export function sectionBuilder(index: DocIndex): SectionBuilder {
  const map = new Map<string, Row>()
  const rowFor = (key: string, segs: string[]): Row => {
    const id = rowId(key, segs)
    const existing = map.get(id)
    if (existing) return existing
    const doc = index.docs.get(key)?.doc
    const row: Row = {
      seen: new Set(),
      health: {
        documentKey: key,
        documentTitle: doc?.title ?? key,
        documentKind: doc?.kind ?? 'other',
        headingPath: segs.join(SEPARATOR),
        depth: segs.length,
        timesCited: 0,
        exercises: [],
        openActions: 0,
        redlines: doc?.redlineCount,
        never: true,
      },
    }
    map.set(id, row)
    return row
  }
  return {
    declare: (key, segments) => prefixes(segments).forEach((p) => rowFor(key, p)),
    cite(key, segments, exercise) {
      const mark = `${exercise.projectId}|${exercise.scenarioId}`
      for (const row of prefixes(segments).map((p) => rowFor(key, p))) {
        if (row.seen.has(mark)) continue
        row.seen.add(mark)
        row.health.timesCited++
        row.health.never = false
        row.health.exercises.push(exercise)
        const at = exercise.exercisedAt
        if (at && (!row.health.lastCitedAt || at > row.health.lastCitedAt))
          row.health.lastCitedAt = at
      }
    },
    addAction(key, segments) {
      for (const p of prefixes(segments)) rowFor(key, p).health.openActions++
    },
    rows: () =>
      [...map.values()]
        .map((r) => r.health)
        .sort(
          (a, b) =>
            a.documentTitle.localeCompare(b.documentTitle) ||
            a.headingPath.localeCompare(b.headingPath, undefined, { numeric: true }),
        ),
  }
}
