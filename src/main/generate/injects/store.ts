// Inject persistence on top of scenario/store: read one, create an empty page for a row,
// delete (with its media folder), link rows to injects, restore a version, and keep the
// per-inject StageRuns and lint warnings on the scenario.
import { promises as fs } from 'node:fs'
import {
  Inject,
  MAX_INJECT_VERSIONS,
  type LintWarning,
  type Scenario,
  type StageRun,
} from '@shared/schemas'
import { AppError } from '../../lib/errors'
import { emit } from '../../lib/events'
import { readJson, safeJoin } from '../../lib/fs'
import { newId } from '../../lib/ids'
import { scenarioLayout } from '../../scenario/layout'
import { getScenario, saveInject, updateScenario, type SaveOptions } from '../../scenario/store'
import { injectDeps } from './deps'
import { INJECT_FIELDS_INVALID, INJECT_RENDER_INVALID } from './text-stage'
import { defaultDelivery } from './type-map'

export async function getInject(
  root: string,
  scenarioId: string,
  injectId: string,
): Promise<Inject> {
  const layout = scenarioLayout(root, scenarioId)
  return readJson(layout.inject(injectId), Inject)
}

/** Absolute media folder for one inject: scenarios/<id>/media/<injectId>/. */
export function injectMediaDir(root: string, scenarioId: string, injectId: string): string {
  return safeJoin(scenarioLayout(root, scenarioId).media, injectId)
}

function requireRow(s: Scenario, rowId: string) {
  const row = s.msel.find((r) => r.id === rowId)
  if (!row) throw new AppError('NOT_FOUND', `No MSEL row ${rowId} in scenario ${s.id}`)
  return row
}

/** Point a MSEL row at its inject (or clear it with undefined). */
export async function linkRow(
  root: string,
  scenarioId: string,
  rowId: string,
  injectId: string | undefined,
  opts: SaveOptions,
): Promise<void> {
  await updateScenario(
    root,
    scenarioId,
    (s) => {
      const row = s.msel.find((r) => r.id === rowId)
      if (!row) return
      if (injectId) row.injectId = injectId
      else delete row.injectId
    },
    { ...opts, snapshot: false },
  )
}

/** A blank page for a row (user-created); the row is linked to it. */
export async function createEmptyInject(
  root: string,
  scenarioId: string,
  rowId: string,
  type: string,
): Promise<Inject> {
  const s = await getScenario(root, scenarioId)
  const row = requireRow(s, rowId)
  if (row.injectId)
    throw new AppError('CONFLICT', `Row ${rowId} already has inject ${row.injectId}`)
  const inject = Inject.parse({
    id: newId(),
    mselRowId: rowId,
    type,
    title: row.event.slice(0, 80),
    deliveryMode: defaultDelivery(type),
    fields: {},
  })
  const saved = await saveInject(root, scenarioId, inject, { by: 'user', note: 'created' })
  await linkRow(root, scenarioId, rowId, saved.id, { by: 'user' })
  return saved
}

/** Remove the inject file and its media folder; unlink the row. */
export async function deleteInject(
  root: string,
  scenarioId: string,
  injectId: string,
): Promise<void> {
  const layout = scenarioLayout(root, scenarioId)
  const inject = await getInject(root, scenarioId, injectId)
  await fs.rm(layout.inject(injectId), { force: true })
  await fs.rm(injectMediaDir(root, scenarioId, injectId), { recursive: true, force: true })
  await updateScenario(
    root,
    scenarioId,
    (s) => {
      for (const row of s.msel) if (row.injectId === injectId) delete row.injectId
      s.warnings = s.warnings.filter((w) => w.injectId !== injectId)
      s.provenance = s.provenance.filter((r) => r.itemId !== injectId)
    },
    { by: 'user', snapshot: false, note: `deleted inject ${inject.mselRowId}` },
  )
  emit('project:changed', { path: root, what: 'injects', scenarioId })
}

/** Put a snapshot back as the current content; the restore itself becomes a user version. */
export async function restoreInjectVersion(
  root: string,
  scenarioId: string,
  injectId: string,
  versionIndex: number,
): Promise<Inject> {
  const inject = await getInject(root, scenarioId, injectId)
  const version = inject.versions[versionIndex]
  if (!version) throw new AppError('NOT_FOUND', `Inject ${injectId} has no version ${versionIndex}`)
  if (inject.locked) throw new AppError('VALIDATION', `Inject ${injectId} is locked`)
  const { snapshot } = version
  const restored: Inject = {
    ...inject,
    title: snapshot.title,
    type: snapshot.type,
    fields: snapshot.fields,
    deliveryMode: snapshot.deliveryMode,
    ...(snapshot.instructorNote ? { instructorNote: snapshot.instructorNote } : {}),
  }
  if (!snapshot.instructorNote) delete restored.instructorNote
  return saveInject(root, scenarioId, restored, {
    by: 'user',
    note: `restored version ${versionIndex + 1} (${version.at})`,
  })
}

/** Versions beyond the cap are dropped oldest-first (the store also trims on save). */
export const trimVersions = (inject: Inject): Inject => ({
  ...inject,
  versions: inject.versions.slice(-MAX_INJECT_VERSIONS),
})

/** True when the inject's fields match its template (false when there is no template). */
async function fieldsValid(inject: Inject): Promise<boolean> {
  const { templates } = await injectDeps()
  if (!templates.listTemplateTypes().includes(inject.type)) return false
  return templates.validateFields(inject.type, inject.fields).length === 0
}

/** Warnings that say the fields do not match the template; stale once they validate. */
const FIELD_WARNINGS = new Set([INJECT_FIELDS_INVALID, INJECT_RENDER_INVALID])

/**
 * After a user save: drop the INJECT_FIELDS_INVALID (text job) and INJECT_RENDER_INVALID
 * (media job) warnings on this inject once its fields validate. Writes scenario.json only
 * when there is a warning to drop.
 */
export async function clearFixedFieldWarnings(
  root: string,
  scenarioId: string,
  inject: Inject,
): Promise<void> {
  const stale = (w: LintWarning) => w.injectId === inject.id && FIELD_WARNINGS.has(w.code)
  const scenario = await getScenario(root, scenarioId)
  if (!scenario.warnings.some(stale) || !(await fieldsValid(inject))) return
  await updateScenario(
    root,
    scenarioId,
    (s) => {
      s.warnings = s.warnings.filter((w) => !stale(w))
    },
    { by: 'user', snapshot: false, note: `fixed fields of inject ${inject.mselRowId}` },
  )
}

// ---- scenario-side bookkeeping (run under the caller's updateScenario) -------------------

export function recordInjectRun(s: Scenario, run: StageRun): void {
  const i = s.provenance.findIndex((r) => r.stage === run.stage && r.itemId === run.itemId)
  if (i >= 0) s.provenance[i] = run
  else s.provenance.push(run)
}

const rowLevel = (w: LintWarning, rowId: string, codes: Set<string>): boolean =>
  w.rowId === rowId && !w.injectId && codes.has(w.code)

/**
 * A row the injects job skipped or failed: its run (keyed by the row id, or by the inject it
 * was regenerating) and the row-level warning replace the previous ones of those codes.
 */
export function recordRowFailure(
  s: Scenario,
  rowId: string,
  run: StageRun,
  warning: LintWarning | undefined,
  codes: Iterable<string>,
): void {
  recordInjectRun(s, run)
  const replaced = new Set(codes)
  s.warnings = s.warnings.filter((w) => !rowLevel(w, rowId, replaced))
  if (warning) s.warnings.push(warning)
}

/** The row has its inject now: drop the row-keyed inject_text runs and row-level warnings. */
export function clearRowRecords(s: Scenario, rowId: string, codes: Iterable<string>): void {
  const replaced = new Set(codes)
  s.provenance = s.provenance.filter((r) => !(r.stage === 'inject_text' && r.itemId === rowId))
  s.warnings = s.warnings.filter((w) => !rowLevel(w, rowId, replaced))
}

/** Replace the warnings (of the given codes) a previous run attached to this inject. */
export function replaceInjectWarnings(
  s: Scenario,
  injectId: string,
  warnings: LintWarning[],
  codes: Iterable<string>,
): void {
  const replaced = new Set(codes)
  s.warnings = [
    ...s.warnings.filter((w) => !(w.injectId === injectId && replaced.has(w.code))),
    ...warnings,
  ]
}
