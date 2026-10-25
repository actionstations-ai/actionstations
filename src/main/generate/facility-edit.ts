// The facts editor's side of facility-facts.md (#155): the read view (file categories with the
// current extraction and its sources beside them), a validated save that keeps the file
// format, a revision check against changes made on disk, and a history of the last 20
// versions under .cache/ (git-ignored by the project's .gitignore).
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import type {
  FacilityFactCategory,
  FacilityFactCategoryInput,
  FacilityFactsFile,
} from '@shared/ipc/project'
import { FactCategoryId } from '@shared/domains'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { ensureDir, safeJoin, writeFileAtomic } from '../lib/fs'
import { loadProject, projectPaths } from '../project/store'
import { categoriesForProject } from './domain'
import { categoryDefinition, type FactCategory } from './facility-categories'
import type { FacilityFacts } from './facility'
import {
  extractProjectFacts,
  facilityFilePath,
  parseFacilityFile,
  readFacilityFile,
  renderFacilityFile,
  resetFacilityFile,
} from './facility-file'
import { projectSectionHits, sourcesFor } from './facility-sources'

export const HISTORY_LIMIT = 20
const HISTORY_DIR = 'facility-facts-history'

export const revisionOf = (markdown: string): string =>
  createHash('sha256').update(markdown).digest('hex').slice(0, 16)

// ---- validation ---------------------------------------------------------------------------

/** One line, no Markdown that would change how the file parses. */
export function cleanFactEntry(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/`/g, '')
    .replace(/^\s*[-*+]\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function cleanLabel(raw: string): string {
  return raw
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/^#+\s*|\s*#+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Trimmed, blank-free, de-duplicated (case-insensitive, first spelling kept) entries. */
export function cleanEntries(entries: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of entries) {
    const entry = cleanFactEntry(raw)
    const key = entry.toLowerCase()
    if (!entry || seen.has(key)) continue
    seen.add(key)
    out.push(entry)
  }
  return out
}

/** Editor categories → facts. Same-id categories merge; a label that cleans to "" is refused. */
export function normalizeCategories(input: FacilityFactCategoryInput[]): FacilityFacts {
  const byId = new Map<string, { id: string; label: string; entries: string[] }>()
  for (const c of input) {
    const label = cleanLabel(c.label)
    if (!label) throw new AppError('VALIDATION', `Category "${c.id}" needs a name`)
    const seen = byId.get(c.id)
    if (seen) seen.entries = cleanEntries([...seen.entries, ...c.entries])
    else byId.set(c.id, { id: c.id, label, entries: cleanEntries(c.entries) })
  }
  return { categories: [...byId.values()], documentCount: 0 }
}

// ---- history ------------------------------------------------------------------------------

const historyDir = (root: string): string => safeJoin(projectPaths(root).cache, HISTORY_DIR)

async function historyFiles(root: string): Promise<string[]> {
  try {
    const names = await fs.readdir(historyDir(root))
    return names.filter((n) => n.endsWith('.md')).sort((a, b) => b.localeCompare(a))
  } catch {
    return []
  }
}

let historySeq = 0

/** Keep the current file as a history version (skipped when it is missing), then prune. */
export async function pushHistory(root: string): Promise<void> {
  let current: string
  try {
    current = await fs.readFile(facilityFilePath(root), 'utf8')
  } catch {
    return
  }
  const [newest] = await historyFiles(root)
  if (newest && (await fs.readFile(safeJoin(historyDir(root), newest), 'utf8')) === current) return
  await ensureDir(historyDir(root))
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const seq = String(historySeq++ % 1000).padStart(3, '0')
  await writeFileAtomic(safeJoin(historyDir(root), `${stamp}-${seq}.md`), current)
  for (const old of (await historyFiles(root)).slice(HISTORY_LIMIT))
    await fs.rm(safeJoin(historyDir(root), old), { force: true })
}

export async function historyCount(root: string): Promise<number> {
  return (await historyFiles(root)).length
}

/** Saved versions, newest first (file contents). */
export async function readHistory(root: string): Promise<string[]> {
  const files = await historyFiles(root)
  return Promise.all(files.map((f) => fs.readFile(safeJoin(historyDir(root), f), 'utf8')))
}

// ---- view ---------------------------------------------------------------------------------

function categoryView(
  id: string,
  label: string,
  entries: string[],
  extracted: FacilityFacts,
  sources: Map<string, Record<string, FacilityFactCategory['sources'][string]>>,
  categories: FactCategory[],
): FacilityFactCategory {
  const def = categoryDefinition(id, categories)
  return {
    id,
    label,
    entries,
    extracted: extracted.categories.find((c) => c.id === id)?.entries ?? [],
    sources: sources.get(id) ?? {},
    linted: !!(def?.mentions && def.noun),
    definable: !def && FactCategoryId.safeParse(id).success,
  }
}

/** facility-facts.md for the editor: its categories, then extracted ones the file lacks. */
export async function readFacilityView(root: string): Promise<FacilityFactsFile> {
  const state = await readFacilityFile(root)
  const project = await loadProject(root)
  // The project's domain profile decides the categories (ADR-0014).
  const categories = categoriesForProject(project)
  const extracted = await extractProjectFacts(root, project, categories)
  const hits = await projectSectionHits(root, project, categories)
  const sources = sourcesFor(extracted, hits, categories)
  const inFile = parseFacilityFile(state.markdown).categories
  const missing = extracted.categories.filter((c) => !inFile.some((f) => f.id === c.id))
  return {
    ...state,
    categories: [
      ...inFile.map((c) => categoryView(c.id, c.label, c.entries, extracted, sources, categories)),
      ...missing.map((c) => categoryView(c.id, c.label, [], extracted, sources, categories)),
    ],
    revision: revisionOf(state.markdown),
    historyCount: await historyCount(root),
  }
}

// ---- writes -------------------------------------------------------------------------------

const queues = new Map<string, Promise<unknown>>()

/** Writes to one project's facts file run one after another. */
function serialized<T>(root: string, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(root) ?? Promise.resolve()).then(task, task)
  queues.set(
    root,
    next.catch(() => undefined),
  )
  return next
}

async function currentRevision(root: string): Promise<string | undefined> {
  try {
    return revisionOf(await fs.readFile(facilityFilePath(root), 'utf8'))
  } catch {
    return undefined
  }
}

export interface SaveFacilityRequest {
  categories: FacilityFactCategoryInput[]
  /** The revision the editor loaded; a different file on disk is a CONFLICT. */
  revision?: string
}

/**
 * Write the editor's facts to facility-facts.md (history first). The marker keeps the
 * extraction's hash, so the file reads as edited unless the facts equal the extraction.
 */
export function saveFacilityFacts(
  root: string,
  req: SaveFacilityRequest,
): Promise<FacilityFactsFile> {
  const facts = normalizeCategories(req.categories)
  return serialized(root, async () => {
    const onDisk = await currentRevision(root)
    if (req.revision && onDisk && onDisk !== req.revision)
      throw new AppError(
        'CONFLICT',
        'facility-facts.md changed on disk since it was opened. Reload to see the new version, then make your changes again.',
      )
    const auto = await extractProjectFacts(root, await loadProject(root))
    await pushHistory(root)
    await writeFileAtomic(facilityFilePath(root), renderFacilityFile(facts, auto))
    emit('project:changed', { path: root, what: 'project' })
    return readFacilityView(root)
  })
}

/** Reset to the extraction, keeping the edited version in the history. */
export function resetFacilityFacts(root: string): Promise<FacilityFactsFile> {
  return serialized(root, async () => {
    await pushHistory(root)
    await resetFacilityFile(root)
    return readFacilityView(root)
  })
}
