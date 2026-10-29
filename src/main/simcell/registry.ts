// One Simcell per open scenario, wired to the real providers, project files and events. The
// live session attaches its bridge while it runs (src/main/live/simcell-link.ts); without a
// session the same object serves the Facilitate page's offline mode.
import type { CapabilityResult } from '@shared/schemas'
import { emit } from '../lib/events'
import { loadFacilityFacts } from '../generate/facility-file'
import { readFacilitatorState, writeFacilitatorState } from '../facilitator/state'
import { loadPrompt } from '../prompts'
import { loadProject } from '../project/store'
import { resolveTextProvider } from '../providers/resolve'
import { getScenario } from '../scenario/store'
import { cachedCapability, runProbes, storeCapability } from './capability'
import type { DraftEnv } from './draft'
import { readPersonas } from './personas'
import { Simcell } from './service'
import { renderLine, speechReady, transcribeClip } from './voice'

const instances = new Map<string, Simcell>()

/** Names a reply may use without a flag: roles, the organization, and the project's facts. */
async function knownNames(root: string, scenarioId: string): Promise<string[]> {
  const names: string[] = []
  try {
    const scenario = await getScenario(root, scenarioId)
    for (const r of scenario.roles) names.push(r.name, r.abbreviation ?? '', r.team ?? '')
    const project = await loadProject(root)
    names.push(
      project.orgName,
      project.name,
      project.brand.city ?? '',
      ...Object.values(project.brand.aliases),
    )
    const facts = await loadFacilityFacts(root, project)
    for (const c of facts.categories) names.push(...c.entries)
  } catch {
    // A missing fact never blocks a draft; the name check just has fewer names to allow.
  }
  return names.filter(Boolean)
}

async function loadEnv(root: string | undefined, scenarioId?: string): Promise<DraftEnv> {
  const [resolved, prompt, names] = await Promise.all([
    resolveTextProvider('roleplay', root),
    loadPrompt('simcell_reply', root),
    root && scenarioId ? knownNames(root, scenarioId) : [],
  ])
  return {
    provider: resolved.provider,
    model: resolved.model,
    providerId: resolved.providerId,
    prompt,
    knownNames: names,
    ...(root ? { projectPath: root } : {}),
  }
}

/** The cached level for the model routed to `roleplay`, re-run when `force` or never checked. */
export async function checkCapability(
  root: string | undefined,
  force: boolean,
  scenarioId?: string,
): Promise<CapabilityResult & { providerId: string; model: string }> {
  const env = await loadEnv(root, scenarioId)
  const cached = force ? undefined : await cachedCapability(env.providerId, env.model)
  if (cached) return { ...cached, providerId: env.providerId, model: env.model }
  const result: CapabilityResult = await runProbes(env)
  await storeCapability(env.providerId, env.model, result)
  return { ...result, providerId: env.providerId, model: env.model }
}

function clockOf(state: Awaited<ReturnType<typeof readFacilitatorState>>, now: number) {
  const running = state.runningSince ? (now - Date.parse(state.runningSince)) / 60_000 : 0
  const whole = Math.max(0, Math.floor(state.elapsedMin + Math.max(0, running)))
  return {
    minutes: whole,
    label: `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`,
  }
}

function create(root: string, scenarioId: string): Simcell {
  return new Simcell({
    root,
    scenarioId,
    loadEnv: () => loadEnv(root, scenarioId),
    capability: (force) => checkCapability(root, force, scenarioId),
    personas: () => readPersonas(root, scenarioId),
    scenario: () => getScenario(root, scenarioId),
    clock: async () => clockOf(await readFacilitatorState(root, scenarioId), Date.now()),
    releasedRowIds: async () =>
      new Set(Object.keys((await readFacilitatorState(root, scenarioId)).delivered)),
    now: () => Date.now(),
    emit: (event, draftId) =>
      event === 'draft-ready'
        ? emit('simcell:draft-ready', { scenarioId, draftId: draftId ?? '' })
        : emit('simcell:queue-changed', { scenarioId }),
    saveExchange: async (ex) => {
      const state = await readFacilitatorState(root, scenarioId)
      await writeFacilitatorState(root, scenarioId, {
        ...state,
        simcell: [...(state.simcell ?? []), ex].slice(-500),
      })
    },
    voice: {
      render: (card, text) => renderLine(root, scenarioId, card, text),
      transcribe: (bytes, keep, dir) => transcribeClip(root, dir, bytes, keep),
      ready: () => speechReady(root),
    },
  })
}

export function simcellFor(root: string, scenarioId: string): Simcell {
  const key = `${root}\0${scenarioId}`
  let s = instances.get(key)
  if (!s) {
    s = create(root, scenarioId)
    instances.set(key, s)
  }
  return s
}

/** Tests only. */
export function resetSimcell(): void {
  for (const s of instances.values()) s.stopClock()
  instances.clear()
}
