// case:* (spec 0448, ADR-0076). The only network use is case:fetch, and only after case:plan-fetch
// showed the size and the user consented. The renderer sends a connector id, never an address.
import { shell } from 'electron'
import { planFetch, runFetch } from '../../case-data/acquire'
import { listGenerators, runGenerator } from '../../case-data/generators'
import { MB, caseBytes, readManifest, removeDataset, saveTimeMapping } from '../../case-data/store'
import { packAppVersion } from '../../packs/app-version'
import { requireProject } from '../../project/guard'
import { encryptionAvailable, hasSecret, setSecret } from '../../secrets'
import { getSettings, updateSettings } from '../../settings/store'
import {
  FBI_CDE_KEY_ID,
  FBI_CDE_SIGNUP_URL,
  isValidDataGovKey,
} from '../../toolkits/connectors/fbi-cde-crime'
import { listConnectors } from '../../toolkits/connectors/registry'
import { AppError } from '../../lib/errors'
import '../../toolkits/generator-modules'
import { defineHandlers } from '../registry'

/** Swapped in tests: the fetch and the clock. */
export const caseDeps: { fetchImpl: typeof fetch | undefined; now: () => Date } = {
  fetchImpl: undefined,
  now: () => new Date(),
}

async function caseKeys() {
  return {
    hasFbiCdeKey: await hasSecret(FBI_CDE_KEY_ID).catch(() => false),
    encryptionAvailable: encryptionAvailable(),
  }
}

/** A connector as the fetch form reads it: plain copies of its declarations (#1139). */
function connectorInfo(c: ReturnType<typeof listConnectors>[number]) {
  const { options, area, contact, ...rest } = c
  return {
    ...rest,
    hosts: [...c.hosts],
    ...(options
      ? {
          options: options.map(({ choices, ...o }) => ({
            ...o,
            ...(choices ? { choices: choices.map((x) => ({ ...x })) } : {}),
          })),
        }
      : {}),
    ...(area
      ? {
          area: {
            ...area,
            ...(area.example
              ? {
                  example: {
                    ...area.example,
                    ...(area.example.bbox
                      ? { bbox: [...area.example.bbox] as typeof area.example.bbox }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(contact ? { contact } : {}),
  }
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

  'case:connectors': () => listConnectors().map(connectorInfo),

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
      contact: (await getSettings()).caseData.contactEmail,
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

  'case:keys': () => caseKeys(),

  'case:fbi-cde-key-set': async ({ key }) => {
    if (!isValidDataGovKey(key))
      throw new AppError(
        'VALIDATION',
        'An api.data.gov key is 40 letters and digits (or DEMO_KEY).',
      )
    await setSecret(FBI_CDE_KEY_ID, key)
    return caseKeys()
  },

  'case:fbi-cde-key-remove': async () => {
    await setSecret(FBI_CDE_KEY_ID, null)
    return caseKeys()
  },

  'case:fbi-cde-signup-open': async () => {
    await shell.openExternal(FBI_CDE_SIGNUP_URL)
  },
})
