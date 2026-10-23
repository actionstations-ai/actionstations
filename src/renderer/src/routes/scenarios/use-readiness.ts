import type { Scenario } from '@shared/schemas/scenario'
import { useIpcQuery } from '../../lib/query'
import { readiness, type Readiness } from './readiness'

/**
 * Live readiness of one scenario from the same queries the tabs use (injects:list for the
 * deck, scenarios:lint for the Warnings tab), so the badge, the next-action bar and the tab
 * counts agree. `undefined` until the scenario and its injects have loaded.
 */
export function useReadiness(
  projectPath: string,
  scenario: Scenario | undefined,
): { readiness: Readiness | undefined; lintCount: number | undefined } {
  const req = { projectPath, scenarioId: scenario?.id ?? '' }
  const injects = useIpcQuery('injects:list', req, { enabled: !!scenario })
  const lint = useIpcQuery('scenarios:lint', req, { enabled: !!scenario })
  if (!scenario || !injects.data) return { readiness: undefined, lintCount: lint.data?.length }
  return {
    readiness: readiness(scenario, injects.data, lint.data),
    lintCount: lint.data?.length,
  }
}
