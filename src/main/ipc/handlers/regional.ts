// regional:* (spec 0440). Every bundle path is verified by main before anything is used; the
// renderer only ever sees summaries.
import { join } from 'node:path'
import { app } from 'electron'
import type { OrgMerge } from '../../regional/merge'
import type { VerifiedBundle } from '../../regional/read'
import type { BundleSummary } from '@shared/ipc/regional'
import { exportBundle, exportReview } from '../../regional/export'
import {
  applyMerge,
  importMerged,
  inspectBundle,
  joinExercise,
  pinBundle,
  previewMerge,
} from '../../regional/import'
import { createIdentity, listIdentities } from '../../regional/identity'
import {
  answerProposal,
  createRegional,
  finalize,
  logSlicesFor,
  propose,
  rosterFor,
  updateSettingsOf,
} from '../../regional/manage'
import { hasRegional, readRegional } from '../../regional/store'
import { logFile, readAll } from '../../live/log-read'
import { ensureDir, writeFileAtomic } from '../../lib/fs'
import { requireProject } from '../../project/guard'
import { defineHandlers } from '../registry'

function summarize(bundle: VerifiedBundle, pin: BundleSummary['pin']): BundleSummary {
  const m = bundle.manifest
  return {
    kind: m.kind,
    exerciseId: m.exerciseId,
    title: m.title,
    final: m.final,
    frameVersion: m.frameVersion,
    createdAt: m.createdAt,
    from: {
      orgId: m.from.orgId,
      name: m.from.name,
      prefix: m.from.prefix,
      fingerprint: m.from.fingerprint,
    },
    orgs: bundle.frame?.orgs ?? [],
    ...(bundle.frame
      ? {
          frame: {
            objectives: bundle.frame.objectives.length,
            phases: bundle.frame.phases.length,
            roles: bundle.frame.roles.length,
            sharedRows: bundle.frame.sharedRows.length,
          },
        }
      : {}),
    slices: [...bundle.slices.values()].map((s) => ({
      orgId: s.orgId,
      revision: s.revision,
      rows: s.rows.length,
      privateRows: s.rows.filter((r) => r.visibility === 'owner_controllers').length,
      injects: s.injects.length,
      proposals: s.proposals.length,
    })),
    mediaFiles: bundle.media.size,
    pin,
  }
}

const version = (): string => app.getVersion()

export default defineHandlers({
  'regional:identities': () => listIdentities(),
  'regional:identity-create': (input) => createIdentity(input),

  'regional:create': async ({ projectPath, scenarioId, orgs, hostOrg }) =>
    createRegional(await requireProject(projectPath), scenarioId, { orgs, hostOrg }),

  'regional:state': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return (await hasRegional(root, scenarioId)) ? readRegional(root, scenarioId) : null
  },

  'regional:settings': async ({ projectPath, scenarioId, ...patch }) =>
    updateSettingsOf(await requireProject(projectPath), scenarioId, patch),

  'regional:export-review': async ({ projectPath, scenarioId, kind }) =>
    exportReview(await requireProject(projectPath), scenarioId, kind, version()),

  'regional:export': async ({ projectPath, scenarioId, kind, path }) => {
    const out = await exportBundle(
      await requireProject(projectPath),
      scenarioId,
      kind,
      path,
      version(),
    )
    return { path: out.path, sha256: out.sha256 }
  },

  'regional:inspect': async ({ path, projectPath, scenarioId }) => {
    const at =
      projectPath && scenarioId
        ? { root: await requireProject(projectPath), scenarioId }
        : undefined
    const { bundle, pin } = await inspectBundle(path, version(), at)
    return summarize(bundle, pin)
  },

  'regional:pin': async ({ projectPath, scenarioId, path, confirmFingerprint, replace }) =>
    pinBundle(
      await requireProject(projectPath),
      scenarioId,
      path,
      version(),
      confirmFingerprint,
      replace,
    ),

  'regional:join': async ({ path, projectPath, orgId, confirmFingerprint }) => {
    const out = await joinExercise(
      await requireProject(projectPath),
      path,
      version(),
      confirmFingerprint,
      orgId,
    )
    return { scenarioId: out.scenarioId }
  },

  'regional:merge-preview': async ({ projectPath, scenarioId, paths }) => {
    const p = await previewMerge(await requireProject(projectPath), scenarioId, paths, version())
    return { bundles: p.bundles, orgs: p.result.orgs.map(viewOf), conflicts: p.result.conflicts }
  },

  'regional:merge-apply': async ({ projectPath, scenarioId, paths, accept }) => {
    const out = await applyMerge(
      await requireProject(projectPath),
      scenarioId,
      paths,
      accept,
      version(),
    )
    return { state: out.state, conflicts: out.result.conflicts }
  },

  'regional:import-merged': async ({ projectPath, scenarioId, path }) => {
    const out = await importMerged(await requireProject(projectPath), scenarioId, path, version())
    return { state: out.state, changes: out.changes }
  },

  'regional:propose': async ({ projectPath, scenarioId, ...input }) =>
    propose(await requireProject(projectPath), scenarioId, input),

  'regional:proposal-resolve': async ({ projectPath, scenarioId, id, accept, note }) =>
    answerProposal(await requireProject(projectPath), scenarioId, id, accept, note),

  'regional:finalize': async ({ projectPath, scenarioId }) =>
    finalize(await requireProject(projectPath), scenarioId),

  'regional:roster': async ({ projectPath, scenarioId }) =>
    rosterFor(await requireProject(projectPath), scenarioId),

  'regional:log-slices': async ({ projectPath, scenarioId, sessionId, folder }) => {
    const root = await requireProject(projectPath)
    const slices = await logSlicesFor(
      root,
      scenarioId,
      await readAll(logFile(root, scenarioId, sessionId)),
    )
    await ensureDir(folder)
    const out = []
    for (const s of slices) {
      const path = join(folder, `session-log-${s.orgId}.json`)
      await writeFileAtomic(path, s.json)
      out.push({ orgId: s.orgId, path, entries: s.entries })
    }
    return out
  },
})

function viewOf(o: OrgMerge) {
  const { rows: _r, injects: _i, roles: _o, ...rest } = o
  return rest
}
