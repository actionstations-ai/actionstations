// Scenario folder store (#28). Layout per docs/02:
//   scenarios/<id>/scenario.json, injects/<injectId>.json, documents/<kind>.md,
//   media/<injectId>/…, history/<artifact>.jsonl
// The generation pipeline (#25) depends only on these signatures.
import { promises as fs } from 'node:fs'
import {
  Inject,
  MAX_INJECT_VERSIONS,
  Scenario,
  type ScenarioBrief,
  type ScenarioDocKind,
  type ScenarioMeta,
} from '@shared/schemas'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { ensureDir, exists, readJson, safeJoin, writeFileAtomic, writeJsonAtomic } from '../lib/fs'
import { newId, nowIso } from '../lib/ids'
import { loadProject, updateProject } from '../project/store'
import { assertNotGenerating } from './busy'
import { appendHistory } from './history'
import { scenarioLayout, withScenarioLock } from './layout'

export interface SaveOptions {
  by: 'user' | 'ai'
  note?: string
  /** Skip the history snapshot (e.g. frequent pipeline checkpoints). */
  snapshot?: boolean
}

const metaOf = (s: Scenario): ScenarioMeta => ({
  id: s.id,
  title: s.title,
  status: s.status,
  updatedAt: s.updatedAt,
})

/** Insert or replace this scenario's entry in project.json scenarios[]. */
async function syncMeta(root: string, scenario: Scenario): Promise<void> {
  await updateProject(root, (p) => {
    const meta = metaOf(scenario)
    const i = p.scenarios.findIndex((m) => m.id === scenario.id)
    if (i >= 0) p.scenarios[i] = meta
    else p.scenarios.push(meta)
  })
}

function parseScenario(value: unknown): Scenario {
  const r = Scenario.safeParse(value)
  if (!r.success) throw new AppError('VALIDATION', 'Invalid scenario', r.error.issues)
  return r.data
}

async function requireScenarioDir(root: string, scenarioId: string) {
  const layout = scenarioLayout(root, scenarioId)
  if (!(await exists(layout.file)))
    throw new AppError('NOT_FOUND', `No scenario ${scenarioId} in this project`)
  return layout
}

/** Validate, write, snapshot, sync meta, emit. Caller holds the scenario lock. */
async function writeScenario(root: string, input: Scenario, opts: SaveOptions): Promise<Scenario> {
  const layout = await requireScenarioDir(root, input.id)
  const scenario = parseScenario({ ...input, updatedAt: nowIso() })
  await writeJsonAtomic(layout.file, scenario)
  if (opts.snapshot !== false) {
    await appendHistory(layout.historyFile('scenario'), {
      by: opts.by,
      note: opts.note,
      snapshot: scenario,
    })
  }
  await syncMeta(root, scenario)
  emit('project:changed', { path: root, what: 'scenario', scenarioId: scenario.id })
  return scenario
}

async function makeScenarioFolders(root: string, scenarioId: string): Promise<void> {
  const layout = scenarioLayout(root, scenarioId)
  if (await exists(layout.dir)) throw new AppError('CONFLICT', `Scenario ${scenarioId} exists`)
  for (const d of [layout.injects, layout.documents, layout.media, layout.history])
    await ensureDir(d)
}

/** Create scenarios/<id>/ and register it in project.json scenarios[]. */
export async function createScenario(
  projectPath: string,
  init: { title: string; brief: ScenarioBrief },
): Promise<Scenario> {
  const project = await loadProject(projectPath)
  const now = nowIso()
  const scenario = parseScenario({
    id: newId(),
    projectId: project.id,
    title: init.title,
    createdAt: now,
    updatedAt: now,
    brief: init.brief,
  })
  await makeScenarioFolders(projectPath, scenario.id)
  await writeJsonAtomic(scenarioLayout(projectPath, scenario.id).file, scenario)
  await syncMeta(projectPath, scenario)
  emit('project:changed', { path: projectPath, what: 'scenarios', scenarioId: scenario.id })
  return scenario
}

export async function getScenario(projectPath: string, scenarioId: string): Promise<Scenario> {
  const layout = await requireScenarioDir(projectPath, scenarioId)
  return readJson(layout.file, Scenario)
}

/**
 * Validate + atomically write scenario.json, update project.json ScenarioMeta, append a
 * history snapshot, emit project:changed {what:'scenario'}. Serialized per scenario.
 * A user save while a generation job owns the scenario fails with CONFLICT (./busy).
 */
export async function saveScenario(
  projectPath: string,
  scenario: Scenario,
  opts: SaveOptions,
): Promise<Scenario> {
  if (opts.by === 'user') assertNotGenerating(projectPath, scenario.id)
  return withScenarioLock(projectPath, scenario.id, () =>
    writeScenario(projectPath, scenario, opts),
  )
}

/** Read-modify-write under the same per-scenario lock. */
export async function updateScenario(
  projectPath: string,
  scenarioId: string,
  mutate: (s: Scenario) => Scenario | void,
  opts: SaveOptions,
): Promise<Scenario> {
  return withScenarioLock(projectPath, scenarioId, async () => {
    const draft = structuredClone(await getScenario(projectPath, scenarioId))
    const next = mutate(draft) ?? draft
    if (next.id !== scenarioId) throw new AppError('VALIDATION', 'A mutation may not change the id')
    return writeScenario(projectPath, next, opts)
  })
}

export async function readScenarioDoc(
  projectPath: string,
  scenarioId: string,
  kind: ScenarioDocKind,
): Promise<string> {
  const layout = await requireScenarioDir(projectPath, scenarioId)
  try {
    return await fs.readFile(layout.doc(kind), 'utf8')
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw e
  }
}

/** Writes documents/<kind>.md, sets scenario.documents[kind] (project-root-relative), history. */
export async function writeScenarioDoc(
  projectPath: string,
  scenarioId: string,
  kind: ScenarioDocKind,
  markdown: string,
  opts: SaveOptions,
): Promise<void> {
  if (opts.by === 'user') assertNotGenerating(projectPath, scenarioId)
  await withScenarioLock(projectPath, scenarioId, async () => {
    const layout = await requireScenarioDir(projectPath, scenarioId)
    await writeFileAtomic(layout.doc(kind), markdown)
    if (opts.snapshot !== false) {
      await appendHistory(layout.historyFile(kind), {
        by: opts.by,
        note: opts.note,
        snapshot: markdown,
      })
    }
    const scenario = await readJson(layout.file, Scenario)
    scenario.documents[kind] = layout.docRel(kind)
    await writeScenario(projectPath, scenario, { ...opts, snapshot: false })
  })
}

/** Inject files, in MSEL order (rows without a position sort last, by id). */
export async function listInjects(projectPath: string, scenarioId: string): Promise<Inject[]> {
  const layout = await requireScenarioDir(projectPath, scenarioId)
  const files = (await fs.readdir(layout.injects).catch(() => [] as string[])).filter((f) =>
    f.endsWith('.json'),
  )
  const injects = await Promise.all(files.map((f) => readJson(safeJoin(layout.injects, f), Inject)))
  const scenario = await readJson(layout.file, Scenario)
  const order = new Map(scenario.msel.map((r, i) => [r.id, i]))
  const pos = (i: Inject) => order.get(i.mselRowId) ?? Number.MAX_SAFE_INTEGER
  return injects.sort((a, b) => pos(a) - pos(b) || a.id.localeCompare(b.id))
}

function withVersion(inject: Inject, opts: SaveOptions, at: string): Inject {
  if (opts.snapshot === false) return inject
  const { title, type, fields, instructorNote, deliveryMode } = inject
  const version = {
    at,
    by: opts.by,
    ...(opts.note ? { note: opts.note } : {}),
    snapshot: { title, type, fields, deliveryMode, ...(instructorNote ? { instructorNote } : {}) },
  }
  return { ...inject, versions: [...inject.versions, version].slice(-MAX_INJECT_VERSIONS) }
}

export async function saveInject(
  projectPath: string,
  scenarioId: string,
  inject: Inject,
  opts: SaveOptions,
): Promise<Inject> {
  return withScenarioLock(projectPath, scenarioId, async () => {
    const layout = await requireScenarioDir(projectPath, scenarioId)
    const at = nowIso()
    const parsed = Inject.safeParse(withVersion({ ...inject, updatedAt: at }, opts, at))
    if (!parsed.success) throw new AppError('VALIDATION', 'Invalid inject', parsed.error.issues)
    await writeJsonAtomic(layout.inject(parsed.data.id), parsed.data)
    emit('project:changed', { path: projectPath, what: 'injects', scenarioId })
    return parsed.data
  })
}

/** Internals shared with ./manage (folder-level operations). */
export { writeScenario as writeScenarioLocked, makeScenarioFolders, requireScenarioDir, syncMeta }
