// simcell:* (#429). Drafts are staff-only and wait for a person: `simcell:resolve` is the only
// path from a draft to a player. Model calls go through the roleplay (else draft) route; voice
// and speech go through the audio and transcribe routes.
import { loadFacilityFacts } from '../../generate/facility-file'
import { jobs } from '../../jobs/manager'
import { AppError } from '../../lib/errors'
import { emit } from '../../lib/events'
import { requireProject } from '../../project/guard'
import { loadProject } from '../../project/store'
import { resolveTextProvider } from '../../providers/resolve'
import { getScenario } from '../../scenario/store'
import { cachedCapability, probeLabels } from '../../simcell/capability'
import { proposePersonas } from '../../simcell/enrich'
import { fromSimcellScripts, readPersonas, writePersonas } from '../../simcell/personas'
import { checkCapability, simcellFor } from '../../simcell/registry'
import { renderLine } from '../../simcell/voice'
import { defineHandlers } from '../registry'

/** Agencies and contacts named in the project's documents: a persona may not take their names. */
async function realNames(root: string): Promise<string[]> {
  try {
    const facts = await loadFacilityFacts(root, await loadProject(root))
    return facts.categories.filter((c) => c.id === 'agencies').flatMap((c) => c.entries)
  } catch {
    return []
  }
}

async function queueOf(root: string, scenarioId: string) {
  const s = simcellFor(root, scenarioId)
  return { ...(await s.list()), status: s.status() }
}

export default defineHandlers({
  'simcell:personas-get': async ({ projectPath, scenarioId }) =>
    readPersonas(await requireProject(projectPath), scenarioId),

  'simcell:personas-save': async ({ projectPath, scenarioId, file }) => {
    const root = await requireProject(projectPath)
    const saved = await writePersonas(root, scenarioId, file, await realNames(root))
    emit('project:changed', { path: root, what: 'scenario', scenarioId })
    return saved
  },

  'simcell:personas-from-scripts': async ({ projectPath, scenarioId, enrich }) => {
    const root = await requireProject(projectPath)
    const scenario = await getScenario(root, scenarioId)
    if (!scenario.simcellScripts.length)
      throw new AppError('VALIDATION', 'This scenario has no SimCell scripts to start from.')
    if (!enrich) return { proposal: fromSimcellScripts(scenario) }
    const job = jobs.start('simcell-personas', (ctx) => proposePersonas(root, scenarioId, ctx), {
      projectPath: root,
      scenarioId,
    })
    return { jobId: job.id }
  },

  'simcell:capability': async ({ projectPath }) => {
    const root = projectPath ? await requireProject(projectPath) : undefined
    try {
      const { providerId, model } = await resolveTextProvider('roleplay', root)
      const cached = await cachedCapability(providerId, model)
      return cached ? { ...cached, providerId, model, labels: probeLabels() } : null
    } catch {
      return null
    }
  },

  'simcell:capability-run': async ({ projectPath }) => {
    const root = projectPath ? await requireProject(projectPath) : undefined
    const job = jobs.start('simcell-capability', () => checkCapability(root, true), {
      ...(root ? { projectPath: root } : {}),
    })
    return { jobId: job.id }
  },

  'simcell:status': async ({ projectPath, scenarioId }) =>
    simcellFor(await requireProject(projectPath), scenarioId).status(),

  'simcell:set-options': async ({ projectPath, scenarioId, enabled, keepRecordings }) =>
    simcellFor(await requireProject(projectPath), scenarioId).setOptions({
      ...(enabled !== undefined ? { enabled } : {}),
      ...(keepRecordings !== undefined ? { keepRecordings } : {}),
    }),

  'simcell:draft': async ({
    projectPath,
    scenarioId,
    personaId,
    threadId,
    instruction,
    replaces,
  }) =>
    simcellFor(await requireProject(projectPath), scenarioId).requestDraft({
      personaId,
      threadId,
      ...(instruction ? { instruction } : {}),
      ...(replaces ? { replaces } : {}),
    }),

  'simcell:queue': async ({ projectPath, scenarioId }) =>
    queueOf(await requireProject(projectPath), scenarioId),

  'simcell:assign': async ({ projectPath, scenarioId, threadId, personaId }) =>
    simcellFor(await requireProject(projectPath), scenarioId).assign(threadId, personaId),

  'simcell:resolve': async ({ projectPath, scenarioId, draftId, action, text, channel, asCall }) =>
    simcellFor(await requireProject(projectPath), scenarioId).resolve({
      draftId,
      action,
      ...(text !== undefined ? { text } : {}),
      ...(channel ? { channel } : {}),
      ...(asCall ? { asCall } : {}),
    }),

  'simcell:offline-turn': async ({ projectPath, scenarioId, personaId, playerText }) =>
    simcellFor(await requireProject(projectPath), scenarioId).offlineTurn(personaId, playerText),

  'simcell:voice-render': async ({ projectPath, scenarioId, personaId, text }) => {
    const root = await requireProject(projectPath)
    const card = (await readPersonas(root, scenarioId)).personas.find((p) => p.id === personaId)
    if (!card) throw new AppError('NOT_FOUND', 'No such persona')
    const line = await renderLine(root, scenarioId, card, text)
    return { assetPath: line.path, durationSec: line.durationSec }
  },

  'simcell:call-start': async ({ projectPath, scenarioId, personaId, threadId, text }) =>
    simcellFor(await requireProject(projectPath), scenarioId).startCall(personaId, threadId, text),

  'simcell:call-end': async ({ projectPath, scenarioId, callId }) =>
    simcellFor(await requireProject(projectPath), scenarioId).endCall(callId),
})
