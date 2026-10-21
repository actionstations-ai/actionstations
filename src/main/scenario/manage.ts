// Folder-level scenario operations: list, delete, duplicate, history browse/restore.
import { promises as fs } from 'node:fs'
import { basename } from 'node:path'
import { z } from 'zod'
import type { HistoryEntry } from '@shared/ipc'
import { Scenario, type ScenarioMeta } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { emit } from '../lib/events'
import { readJson, safeJoin, writeFileAtomic, writeJsonAtomic } from '../lib/fs'
import { newId, nowIso } from '../lib/ids'
import { loadProject, updateProject } from '../project/store'
import { readHistory, toHistoryEntries } from './history'
import { scenarioLayout, withScenarioLock, type HistoryArtifact } from './layout'
import {
  makeScenarioFolders,
  requireScenarioDir,
  syncMeta,
  writeScenarioDoc,
  writeScenarioLocked,
} from './store'

/** project.json scenarios[], most recently updated first. */
export async function listScenarios(projectPath: string): Promise<ScenarioMeta[]> {
  const project = await loadProject(projectPath)
  return [...project.scenarios].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/** Remove scenarios/<id>/ and its project.json entry. A missing folder is not an error. */
export async function deleteScenario(projectPath: string, scenarioId: string): Promise<void> {
  await withScenarioLock(projectPath, scenarioId, async () => {
    const { dir } = scenarioLayout(projectPath, scenarioId)
    await fs.rm(dir, { recursive: true, force: true })
    await updateProject(projectPath, (p) => {
      p.scenarios = p.scenarios.filter((m) => m.id !== scenarioId)
    })
  })
  emit('project:changed', { path: projectPath, what: 'scenarios', scenarioId })
}

/** Rewrite project-relative paths that point into the source scenario's folder. */
function retarget(text: string, fromId: string, toId: string): string {
  return text.split(`scenarios/${fromId}/`).join(`scenarios/${toId}/`)
}

async function copyInjects(root: string, fromId: string, toId: string): Promise<void> {
  const src = scenarioLayout(root, fromId)
  const dst = scenarioLayout(root, toId)
  for (const f of await fs.readdir(src.injects).catch(() => [] as string[])) {
    if (!f.endsWith('.json')) continue
    const raw = await fs.readFile(safeJoin(src.injects, basename(f)), 'utf8')
    await writeFileAtomic(safeJoin(dst.injects, basename(f)), retarget(raw, fromId, toId))
  }
}

async function copyFolder(from: string, to: string): Promise<void> {
  await fs.cp(from, to, { recursive: true, errorOnExist: false, force: true })
}

/** Copy a scenario (documents, injects, media; not history) under a new id. */
export async function duplicateScenario(
  projectPath: string,
  scenarioId: string,
  title?: string,
): Promise<Scenario> {
  const srcLayout = await requireScenarioDir(projectPath, scenarioId)
  const source = await readJson(srcLayout.file, Scenario)
  const id = newId()
  await makeScenarioFolders(projectPath, id)
  const dst = scenarioLayout(projectPath, id)
  await copyFolder(srcLayout.documents, dst.documents)
  await copyFolder(srcLayout.media, dst.media)
  await copyInjects(projectPath, scenarioId, id)
  const now = nowIso()
  const copy = Scenario.parse({
    ...JSON.parse(retarget(JSON.stringify(source), scenarioId, id)),
    id,
    title: title?.trim() || `${source.title} (copy)`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  })
  await writeJsonAtomic(dst.file, copy)
  await syncMeta(projectPath, copy)
  emit('project:changed', { path: projectPath, what: 'scenarios', scenarioId: id })
  return copy
}

export async function listHistory(
  projectPath: string,
  scenarioId: string,
  artifact: HistoryArtifact,
): Promise<HistoryEntry[]> {
  const layout = await requireScenarioDir(projectPath, scenarioId)
  return toHistoryEntries(await readHistory(layout.historyFile(artifact)))
}

async function findEntry(
  projectPath: string,
  scenarioId: string,
  artifact: HistoryArtifact,
  entryId: string,
) {
  const layout = await requireScenarioDir(projectPath, scenarioId)
  const entry = (await readHistory(layout.historyFile(artifact))).find((e) => e.id === entryId)
  if (!entry) throw new AppError('NOT_FOUND', `No history entry ${entryId} for ${artifact}`)
  return entry
}

/** Restore a snapshot as a new user save (the restore itself becomes a history entry). */
export async function restoreHistory(
  projectPath: string,
  scenarioId: string,
  artifact: HistoryArtifact,
  entryId: string,
): Promise<void> {
  const entry = await findEntry(projectPath, scenarioId, artifact, entryId)
  const note = `Restored version from ${entry.at}`
  if (artifact !== 'scenario') {
    const markdown = z.string().parse(entry.snapshot)
    return writeScenarioDoc(projectPath, scenarioId, artifact, markdown, { by: 'user', note })
  }
  await withScenarioLock(projectPath, scenarioId, async () => {
    const snapshot = Scenario.parse(entry.snapshot)
    await writeScenarioLocked(projectPath, { ...snapshot, id: scenarioId }, { by: 'user', note })
  })
}
