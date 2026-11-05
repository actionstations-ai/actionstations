// case:* (spec 0448, ADR-0076). The only network use is case:fetch, and only after case:plan-fetch
// showed the size and the user consented. The renderer sends a connector id, never an address.
import { planFetch, runFetch } from '../../case-data/acquire'
import { listGenerators, runGenerator } from '../../case-data/generators'
import { MB, caseBytes, readManifest, removeDataset, saveTimeMapping } from '../../case-data/store'
import { packAppVersion } from '../../packs/app-version'
import { requireProject } from '../../project/guard'
import { getSettings, updateSettings } from '../../settings/store'
import { registerBuiltinConnectors } from '../../toolkits/connectors'
import { registerFloodGenerators } from '../../toolkits/flooding'
import { listConnectors } from '../../toolkits/connectors/registry'
import '../../toolkits/generator-modules'
import { defineHandlers } from '../registry'

registerBuiltinConnectors()
registerFloodGenerators()

/** Swapped in tests: the fetch and the clock. */
export const caseDeps: { fetchImpl: typeof fetch | undefined; now: () => Date } = {
  fetchImpl: undefined,
  now: () => new Date(),
}

const limitMb = async (): Promise<number> => (await getSettings()).caseData.maxMbPerScenario

export default defineHandlers({
  'case:get': async ({ projectPath, scenarioId }) => {
    const root = await requireProject(projectPath)
    return {
      manifest: (await readManifest(root, scenarioId)) ?? null,
      bytes: await caseBytes(root, scenarioId),
      limitBytes: (await limitMb()) * MB,
    }
  },

  'case:connectors': () => listConnectors().map((c) => ({ ...c, hosts: [...c.hosts] })),

  'case:generators': () => listGenerators(),

  'case:plan-fetch': async ({ projectPath, scenarioId, connectorId, query }) => {
    const root = await requireProject(projectPath)
    const plan = await planFetch(root, scenarioId, connectorId, query, {
      maxMbPerScenario: await limitMb(),
      now: caseDeps.now,
    })
    return { ...plan, hosts: [...plan.hosts] }
  },

  'case:fetch': async ({ projectPath, scenarioId, estimateId, consent }) => {
    const root = await requireProject(projectPath)
    return runFetch(root, scenarioId, estimateId, consent, {
      maxMbPerScenario: await limitMb(),
      version: packAppVersion(),
      now: caseDeps.now,
      ...(caseDeps.fetchImpl ? { fetchImpl: caseDeps.fetchImpl } : {}),
    })
  },

  'case:generate': async ({ projectPath, scenarioId, generatorId, params }) =>
    runGenerator(await requireProject(projectPath), scenarioId, generatorId, params, {
      maxMbPerScenario: await limitMb(),
    }),

  'case:remove-dataset': async ({ projectPath, scenarioId, datasetId }) =>
    removeDataset(await requireProject(projectPath), scenarioId, datasetId),

  'case:time-mapping-save': async ({ projectPath, scenarioId, timeMapping }) =>
    saveTimeMapping(await requireProject(projectPath), scenarioId, timeMapping ?? undefined),

  'case:settings': async () => (await getSettings()).caseData,

  'case:settings-save': async (patch) => {
    await updateSettings((s) => {
      s.caseData = patch
    })
    return (await getSettings()).caseData
  },
})
