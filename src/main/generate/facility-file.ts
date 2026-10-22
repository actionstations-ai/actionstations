// <project>/facility-facts.md (#143): the facility facts as a file the designer can read and
// correct. Ingest and re-index write it from the documents; once the designer edits it (the
// body no longer matches the hash in its marker) it is never overwritten again, and fresh
// extraction results go to facility-facts.generated.md beside it. The generator reads the
// file, so additions and removals there are what the prompts and the lint use.
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type { Project } from '@shared/schemas'
import { exists, safeJoin, writeFileAtomic } from '../lib/fs'
import { documentFiles } from '../ingest/storage'
import { loadProject } from '../project/store'
import { emit } from '../lib/events'
import { DEFAULT_FACT_CATEGORIES, type FactCategory } from './facility-categories'
import { extractFacilityFacts, type FacilityFacts } from './facility'

export const FACILITY_FILE = 'facility-facts.md'
export const FACILITY_GENERATED_FILE = 'facility-facts.generated.md'

const MARKER = /^<!-- ttx:facility-facts v1 auto-hash=([0-9a-f]{64}) -->$/m
const CATEGORY_ID = /^<!--\s*category:\s*([A-Za-z0-9_-]+)\s*-->$/
const NONE_LINE = '_None found in the documents._'

const INTRO = `These are the identifiers the generator treats as real for this project: it gives them to
the model as the only allowed names and flags generated rows that use others. They were
extracted from the ingested documents.

Edit them in the app (Facility facts in the project) or here: add an entry the extraction
missed, delete one that is wrong, or add a new \`## Section\` for another kind of
identifier. One entry per \`- \` bullet; ranges such as \`A1–A8\` work for gates.

Your edits win: once you change this file, re-ingesting documents no longer overwrites it,
and the fresh extraction goes to \`${FACILITY_GENERATED_FILE}\` instead. To return to the
extracted version, use "Reset to extracted facts" on the Facility facts screen (earlier
versions are kept in \`.cache/facility-facts-history/\`).`

// ---- render / parse -----------------------------------------------------------------------

function sectionsMarkdown(facts: FacilityFacts): string {
  return facts.categories
    .map((c) => {
      const body = c.entries.length ? c.entries.map((e) => `- ${e}`).join('\n') : NONE_LINE
      return `## ${c.label}\n<!-- category: ${c.id} -->\n\n${body}\n`
    })
    .join('\n')
}

const normalize = (s: string): string =>
  s
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim()

const hashOf = (sections: string): string =>
  createHash('sha256').update(normalize(sections)).digest('hex')

/** The sections part of the file: everything from the first `## ` heading on. */
function sectionsOf(md: string): string {
  const at = md.search(/^## /m)
  return at < 0 ? '' : md.slice(at)
}

/**
 * The whole facility-facts.md. The marker carries the hash of the extracted facts (`auto`,
 * default: `facts` themselves), so a file whose sections differ from them reads as edited.
 */
export function renderFacilityFile(facts: FacilityFacts, auto: FacilityFacts = facts): string {
  const sections = sectionsMarkdown(facts)
  const marker = `<!-- ttx:facility-facts v1 auto-hash=${hashOf(sectionsMarkdown(auto))} -->`
  return `# Facility facts\n\n${marker}\n\n${INTRO}\n\n${sections}`
}

/** True when the file's sections still match the hash it was written with. */
export function isUnedited(md: string): boolean {
  const m = MARKER.exec(md)
  return !!m && m[1] === hashOf(sectionsOf(md))
}

const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'facts'

/** Category id for a heading the user wrote without an id comment. */
function idForLabel(label: string): string {
  const known = DEFAULT_FACT_CATEGORIES.find((c) => c.label.toLowerCase() === label.toLowerCase())
  return known?.id ?? slug(label)
}

const cleanEntry = (line: string): string =>
  line
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/`/g, '')
    .trim()

/** facility-facts.md → facts. Every `## ` section is a category; `- ` bullets are entries. */
export function parseFacilityFile(md: string, documentCount = 0): FacilityFacts {
  const categories: FacilityFacts['categories'] = []
  let current: FacilityFacts['categories'][number] | undefined
  let idFromComment = false
  for (const raw of sectionsOf(md).split('\n')) {
    const line = raw.trim()
    const heading = /^##\s+(.+?)\s*#*$/.exec(line)
    if (heading) {
      current = { id: idForLabel(heading[1]!), label: heading[1]!, entries: [] }
      idFromComment = false
      categories.push(current)
      continue
    }
    if (!current) continue
    const id = CATEGORY_ID.exec(line)
    if (id && !idFromComment) {
      current.id = id[1]!
      idFromComment = true
      continue
    }
    if (/^[-*+]\s+\S/.test(line)) {
      const entry = cleanEntry(line)
      if (entry && !current.entries.includes(entry)) current.entries.push(entry)
    }
  }
  return { categories: mergeDuplicateIds(categories), documentCount }
}

/** Two sections with the same id (a pasted duplicate) become one. */
function mergeDuplicateIds(categories: FacilityFacts['categories']): FacilityFacts['categories'] {
  const byId = new Map<string, FacilityFacts['categories'][number]>()
  for (const c of categories) {
    const seen = byId.get(c.id)
    if (seen) seen.entries.push(...c.entries.filter((e) => !seen.entries.includes(e)))
    else byId.set(c.id, c)
  }
  return [...byId.values()]
}

// ---- project files ------------------------------------------------------------------------

export const facilityFilePath = (root: string): string => safeJoin(root, FACILITY_FILE)
export const facilityGeneratedPath = (root: string): string =>
  safeJoin(root, FACILITY_GENERATED_FILE)

async function documentTexts(root: string, project: Project): Promise<string[]> {
  const texts: string[] = []
  for (const doc of project.documents) {
    if (doc.status !== 'ok') continue
    try {
      texts.push(await fs.readFile(documentFiles(root, doc).text, 'utf8'))
    } catch {
      // A document without text.md (ingest interrupted) contributes nothing.
    }
  }
  return texts
}

/** Facts extracted from the documents right now (ignores facility-facts.md). */
export async function extractProjectFacts(
  root: string,
  project: Project,
  categories: FactCategory[] = DEFAULT_FACT_CATEGORIES,
): Promise<FacilityFacts> {
  return extractFacilityFacts(await documentTexts(root, project), categories)
}

async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await fs.readFile(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
}

export type FacilityRefresh = 'written' | 'kept-edited' | 'unchanged'

/**
 * After ingest / re-index / document removal: rewrite facility-facts.md from the documents
 * unless the designer edited it; then the extraction goes to facility-facts.generated.md.
 */
export async function refreshFacilityFile(root: string): Promise<FacilityRefresh> {
  const project = await loadProject(root)
  const auto = renderFacilityFile(await extractProjectFacts(root, project))
  const current = await readIfExists(facilityFilePath(root))
  let result: FacilityRefresh
  if (current === undefined || isUnedited(current)) {
    result = current === auto ? 'unchanged' : 'written'
    if (result === 'written') await writeFileAtomic(facilityFilePath(root), auto)
    await fs.rm(facilityGeneratedPath(root), { force: true })
  } else {
    await writeFileAtomic(facilityGeneratedPath(root), auto)
    result = 'kept-edited'
  }
  if (result !== 'unchanged') emit('project:changed', { path: root, what: 'project' })
  return result
}

/** Throw away the designer's edits: facility-facts.md becomes the extracted version again. */
export async function resetFacilityFile(root: string): Promise<string> {
  const project = await loadProject(root)
  const auto = renderFacilityFile(await extractProjectFacts(root, project))
  await writeFileAtomic(facilityFilePath(root), auto)
  await fs.rm(facilityGeneratedPath(root), { force: true })
  emit('project:changed', { path: root, what: 'project' })
  return auto
}

export interface FacilityFileState {
  /** Project-root-relative path of the file. */
  path: string
  markdown: string
  /** The designer changed it since it was generated. */
  edited: boolean
  /** The newer extraction, when an edited file kept a re-ingest from overwriting it. */
  generatedMarkdown?: string
}

/** The file as it is (created from the documents when missing). */
export async function readFacilityFile(root: string): Promise<FacilityFileState> {
  if (!(await exists(facilityFilePath(root)))) await refreshFacilityFile(root)
  const markdown = (await readIfExists(facilityFilePath(root))) ?? ''
  const generatedMarkdown = await readIfExists(facilityGeneratedPath(root))
  return {
    path: FACILITY_FILE,
    markdown,
    edited: !isUnedited(markdown),
    ...(generatedMarkdown !== undefined ? { generatedMarkdown } : {}),
  }
}

/**
 * The facts the generator uses: facility-facts.md when it exists (the designer's edits win,
 * removals included), else the extraction, which is then written to the file.
 */
export async function loadFacilityFacts(root: string, project: Project): Promise<FacilityFacts> {
  const documentCount = project.documents.filter((d) => d.status === 'ok').length
  const md = await readIfExists(facilityFilePath(root))
  if (md !== undefined) return parseFacilityFile(md, documentCount)
  const facts = await extractProjectFacts(root, project)
  await writeFileAtomic(facilityFilePath(root), renderFacilityFile(facts))
  return facts
}
