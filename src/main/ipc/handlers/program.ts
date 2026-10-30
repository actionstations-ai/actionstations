// program:* (#424): the exercise program folder. The folder is chosen by the user in a dialog
// (the renderer passes the path from dialog:open-directory); after that every channel is held to
// the active or recent program (requireProgram). No channel uses the network.
import { proposeNextExercise } from '@shared/program/propose'
import { requireProject } from '../../project/guard'
import { listAllActions } from '../../program/actions'
import * as actions from '../../program/actions'
import { requireProgram } from '../../program/guard'
import { applyCsvImport, previewCsvImport } from '../../program/csv-import'
import { applyAarImport, previewAarImport } from '../../program/import-aar'
import { linkProject, unlinkProject } from '../../program/links'
import { openSummary } from '../../program/open'
import { exportProgram } from '../../program/export'
import { loadHealth } from '../../program/health'
import { saveSchedule } from '../../program/schedule'
import { readSnapshots, refreshSnapshots } from '../../program/snapshot'
import {
  closeProgram,
  createProgram,
  loadProgram,
  loadSchedule,
  openProgram,
  updateProgram,
} from '../../program/store'
import { defineHandlers } from '../registry'

export default defineHandlers({
  'program:create': async (req) => openSummary(await openProgram(await createProgram(req))),

  'program:open': async ({ programPath }) => {
    const root = await openProgram(programPath)
    await refreshSnapshots(root).catch((e) => console.error('[program] refresh failed', e))
    return openSummary(root)
  },

  'program:get': async ({ programPath }) => openSummary(await requireProgram(programPath)),

  'program:close': () => closeProgram(),

  'program:update': async ({ programPath, patch, baseUpdatedAt }) => {
    const root = await requireProgram(programPath)
    await updateProgram(
      root,
      (p) => {
        if (patch.name !== undefined) p.name = patch.name
        if (patch.orgName !== undefined) p.orgName = patch.orgName
        if (patch.cycle !== undefined) p.cycle = patch.cycle
        if (patch.priorities !== undefined) p.priorities = patch.priorities
        if (patch.lock !== undefined) p.lock = patch.lock
      },
      baseUpdatedAt,
    )
    return openSummary(root)
  },

  'program:link-project': async ({ programPath, projectPath }) => {
    const root = await requireProgram(programPath)
    const projectRoot = await requireProject(projectPath)
    const program = await linkProject(root, projectRoot)
    await refreshSnapshots(
      root,
      program.projects.map((l) => l.projectId),
    )
    return openSummary(root)
  },

  'program:unlink-project': async ({ programPath, projectId }) => {
    const root = await requireProgram(programPath)
    await unlinkProject(root, projectId)
    return openSummary(root)
  },

  'program:refresh': async ({ programPath, projectIds }) => {
    await refreshSnapshots(await requireProgram(programPath), projectIds)
  },

  'program:snapshots': async ({ programPath }) => readSnapshots(await requireProgram(programPath)),

  'program:actions-list': async ({ programPath, filter }) =>
    actions.listActions(await requireProgram(programPath), filter),

  'program:action-get': async ({ programPath, id }) =>
    actions.getAction(await requireProgram(programPath), id),

  'program:action-save': async ({ programPath, action, baseRevision }) =>
    actions.saveAction(await requireProgram(programPath), action, baseRevision),

  'program:action-status': async ({ programPath, ids, to, note, verification }) =>
    actions.changeStatus(await requireProgram(programPath), ids, to, note, verification),

  'program:action-bulk': async ({ programPath, ids, patch }) =>
    actions.bulkUpdate(await requireProgram(programPath), ids, patch),

  'program:action-delete': async ({ programPath, id }) =>
    actions.deleteAction(await requireProgram(programPath), id),

  'program:schedule-save': async ({ programPath, schedule, baseRevision }) =>
    saveSchedule(await requireProgram(programPath), schedule, baseRevision),

  'program:import-aar-preview': async ({ programPath, projectPath, scenarioId }) =>
    previewAarImport(
      await requireProgram(programPath),
      await requireProject(projectPath),
      scenarioId,
    ),

  'program:import-aar': async ({ programPath, projectPath, scenarioId, items }) =>
    applyAarImport(
      await requireProgram(programPath),
      await requireProject(projectPath),
      scenarioId,
      items,
    ),

  'program:import-csv-preview': async ({ programPath, csv }) =>
    previewCsvImport(await requireProgram(programPath), csv),

  'program:import-csv': async ({ programPath, csv }) =>
    applyCsvImport(await requireProgram(programPath), csv),

  'program:propose': async ({ programPath }) => {
    const root = await requireProgram(programPath)
    const [program, schedule, snapshots, list] = await Promise.all([
      loadProgram(root),
      loadSchedule(root),
      readSnapshots(root),
      listAllActions(root),
    ])
    return proposeNextExercise(
      program,
      schedule.value,
      snapshots,
      list.actions.map((v) => v.action),
    )
  },

  'program:health': async ({ programPath, filter }) =>
    loadHealth(await requireProgram(programPath), filter),

  'program:export': async ({ programPath, outDir, targets, filter }) => ({
    files: await exportProgram(await requireProgram(programPath), outDir, targets, filter),
  }),
})
