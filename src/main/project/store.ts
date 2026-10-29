// Core project-folder store (ADR-0003). Folder layout:
//   <Name>.asproj/   (older projects: <Name>.ttxproj/, opened the same way)
//     project.json  documents/<docId>/  scenarios/<id>/{scenario.json,injects/,documents/,media/,history/}  prompts/
//     index.sqlite  (rebuildable, gitignored via the project's own .gitignore)
import { promises as fs } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { app } from 'electron'
import { Project, PROJECT_FORMAT_VERSION, type OpenProject } from '@shared/schemas'
import { packSnapshotFor } from '@shared/domains'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import {
  ensureDir,
  exists,
  readJson,
  safeJoin,
  slugify,
  writeFileAtomic,
  writeJsonAtomic,
} from '../lib/fs'
import { newId, nowIso } from '../lib/ids'
import { markProjectOpen } from '../lib/project-registry'
import { updateSettings } from '../settings/store'

export const PROJECT_EXT = '.asproj'
/** Project folders made before the rename to Action Stations (#277). Still opened as-is. */
export const LEGACY_PROJECT_EXT = '.ttxproj'
const PROJECT_FILE = 'project.json'
// exports/ is the export page's default output folder (#238): rebuilt from the project.
// Hot wash audio (#425) is never committed by accident when a project is kept in git.
const PROJECT_GITIGNORE = [
  'index.sqlite',
  'index.sqlite-*',
  '.cache/',
  'exports/',
  'scenarios/*/hotwash/**/audio.*',
  // Map archives copied into a project (#436) are large and rebuildable from the store.
  'maps/*/*.pmtiles',
  'maps/*/*.mbtiles',
  '',
].join('\n')

/** Well-known locations inside a project folder. All results are guarded absolute paths. */
export const projectPaths = (root: string) => ({
  root: resolve(root),
  file: safeJoin(root, PROJECT_FILE),
  index: safeJoin(root, 'index.sqlite'),
  cache: safeJoin(root, '.cache'),
  documents: safeJoin(root, 'documents'),
  document: (docId: string) => safeJoin(root, 'documents', docId),
  scenarios: safeJoin(root, 'scenarios'),
  scenario: (scenarioId: string) => safeJoin(root, 'scenarios', scenarioId),
  /** Media folder for one scenario; asset paths stored in JSON are relative to root. */
  scenarioMedia: (scenarioId: string) => safeJoin(root, 'scenarios', scenarioId, 'media'),
  prompts: safeJoin(root, 'prompts'),
  ideas: safeJoin(root, 'ideas.json'),
})

export async function isProjectFolder(path: string): Promise<boolean> {
  return exists(join(path, PROJECT_FILE))
}

function appVersion(): string {
  try {
    return app.getVersion()
  } catch {
    return '0.0.0'
  }
}

export async function createProject(input: {
  parentDir: string
  name: string
  orgName?: string
  orgType?: string
}): Promise<OpenProject> {
  const root = resolve(input.parentDir, slugify(input.name) + PROJECT_EXT)
  if (await exists(root)) throw new AppError('CONFLICT', `A folder already exists at ${root}`)
  const now = nowIso()
  const project = Project.parse({
    formatVersion: PROJECT_FORMAT_VERSION,
    id: newId(),
    name: input.name,
    orgName: input.orgName ?? '',
    orgType: input.orgType ?? 'generic',
    // A pack domain is copied into the project when chosen (#263).
    domainProfileSnapshot: packSnapshotFor(input.orgType),
    createdAt: now,
    updatedAt: now,
    appVersion: appVersion(),
  })
  const paths = projectPaths(root)
  for (const dir of [paths.documents, paths.scenarios, paths.prompts]) await ensureDir(dir)
  await writeFileAtomic(join(root, '.gitignore'), PROJECT_GITIGNORE)
  await writeJsonAtomic(paths.file, project)
  await touchRecent(root, project)
  return { path: root, project }
}

export async function loadProject(path: string): Promise<Project> {
  const root = resolve(path)
  if (!(await isProjectFolder(root)))
    throw new AppError('NOT_FOUND', `Not a project folder: ${root}`)
  return readJson(join(root, PROJECT_FILE), Project)
}

/** Open = load + remember (recent list, media protocol allow-list). */
export async function openProject(path: string): Promise<OpenProject> {
  const root = resolve(path)
  const project = await loadProject(root)
  await touchRecent(root, project)
  return { path: root, project }
}

const locks = new Map<string, Promise<unknown>>()

/**
 * Read-modify-write project.json with per-project serialization, so concurrent writers
 * (ingest jobs, settings UI, generation) never lose each other's changes.
 */
export async function updateProject(
  path: string,
  mutate: (p: Project) => Project | void,
): Promise<Project> {
  const root = resolve(path)
  const prev = locks.get(root) ?? Promise.resolve()
  const run = prev
    .catch(() => undefined)
    .then(async () => {
      const current = await loadProject(root)
      const draft = structuredClone(current)
      const next = Project.parse({ ...(mutate(draft) ?? draft), updatedAt: nowIso() })
      await writeJsonAtomic(join(root, PROJECT_FILE), next)
      return next
    })
  locks.set(root, run)
  try {
    const result = await run
    emit('project:changed', { path: root, what: 'project' })
    return result
  } finally {
    if (locks.get(root) === run) locks.delete(root)
  }
}

export async function touchRecent(root: string, project: Project): Promise<void> {
  markProjectOpen(root)
  await updateSettings((s) => {
    const rest = s.recentProjects.filter((r) => resolve(r.path) !== root)
    s.recentProjects = [
      {
        path: root,
        name: project.name,
        orgName: project.orgName,
        openedAt: nowIso(),
        archived: project.archived,
      },
      ...rest,
    ].slice(0, 30)
  })
}

/** Default folder name for display when project.json is unreadable. */
export const folderLabel = (path: string): string => {
  const name = basename(path)
  for (const ext of [PROJECT_EXT, LEGACY_PROJECT_EXT])
    if (name.toLowerCase().endsWith(ext)) return name.slice(0, -ext.length)
  return name
}

export async function listDir(path: string): Promise<string[]> {
  try {
    return await fs.readdir(path)
  } catch {
    return []
  }
}
