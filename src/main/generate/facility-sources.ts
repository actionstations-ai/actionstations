// Where each extracted facility fact came from (#155): the facts editor shows "Airport
// Emergency Plan › 4.2 Airfield" beside an auto entry. Extraction runs once per document
// section with the same category definitions as extractFacilityFacts, and an entry's source
// is the first section whose identifiers overlap it (a gate range "A1–A8" matches the
// section that named Gate A3).
import { promises as fs } from 'node:fs'
import type { Project } from '@shared/schemas'
import type { FacilityFactSource } from '@shared/ipc/project'
import { documentFiles } from '../ingest/storage'
import { categoryDefinition, type FactCategory } from './facility-categories'
import { extractFacilityFacts, type FacilityFacts } from './facility'

export interface DocumentSection {
  heading: string
  text: string
}

/** Markdown text → sections, each under its nearest ATX heading ("" before the first one). */
export function splitSections(text: string): DocumentSection[] {
  const sections: DocumentSection[] = []
  let current: DocumentSection = { heading: '', text: '' }
  for (const line of text.split('\n')) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      if (current.text.trim()) sections.push(current)
      current = { heading: heading[1]!.replace(/[*_`]/g, '').trim(), text: '' }
    } else current.text += `${line}\n`
  }
  if (current.text.trim()) sections.push(current)
  return sections
}

/** The identifiers an entry stands for, normalized the way the category compares them. */
function idsOf(category: FactCategory | undefined, entry: string): string[] {
  return category?.expand ? category.expand([entry]) : [entry]
}

interface SectionHit {
  source: FacilityFactSource
  /** Category id → identifiers this section names. */
  ids: Map<string, Set<string>>
}

function sectionHits(
  doc: { id: string; title: string },
  text: string,
  categories: FactCategory[],
): SectionHit[] {
  return splitSections(text).map((section) => {
    const facts = extractFacilityFacts([section.text], categories)
    const ids = new Map<string, Set<string>>()
    for (const c of facts.categories) {
      const def = categoryDefinition(c.id, categories)
      ids.set(c.id, new Set(c.entries.flatMap((e) => idsOf(def, e))))
    }
    return {
      source: { documentId: doc.id, documentTitle: doc.title, section: section.heading },
      ids,
    }
  })
}

/** For every extracted entry, the first document section that names it. */
export function sourcesFor(
  extracted: FacilityFacts,
  hits: SectionHit[],
  categories: FactCategory[],
): Map<string, Record<string, FacilityFactSource>> {
  const out = new Map<string, Record<string, FacilityFactSource>>()
  for (const c of extracted.categories) {
    const def = categoryDefinition(c.id, categories)
    const sources: Record<string, FacilityFactSource> = {}
    for (const entry of c.entries) {
      const ids = idsOf(def, entry)
      const hit = hits.find((h) => ids.some((id) => h.ids.get(c.id)?.has(id)))
      if (hit) sources[entry] = hit.source
    }
    out.set(c.id, sources)
  }
  return out
}

/** Section-level hits for every ingested document of the project. */
export async function projectSectionHits(
  root: string,
  project: Project,
  categories: FactCategory[],
): Promise<SectionHit[]> {
  const hits: SectionHit[] = []
  for (const doc of project.documents) {
    if (doc.status !== 'ok') continue
    let text: string
    try {
      text = await fs.readFile(documentFiles(root, doc).text, 'utf8')
    } catch {
      continue
    }
    hits.push(...sectionHits({ id: doc.id, title: doc.title || doc.filename }, text, categories))
  }
  return hits
}
