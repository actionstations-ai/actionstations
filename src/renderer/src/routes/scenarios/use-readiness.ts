import type { Scenario } from '@shared/schemas/scenario'
import { useIpcQuery } from '../../lib/query'
import { hasRecordEvidence } from './aar-evidence'
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
  // After the exercise (#419): the next action becomes the AAR/IP draft until one exists.
  const facilitator = useIpcQuery('facilitator:state-get', req, { enabled: !!scenario })
  const aar = useIpcQuery('aar:get', req, { enabled: !!scenario })
  if (!scenario || !injects.data) return { readiness: undefined, lintCount: lint.data?.length }
  const after = {
    hasEvidence: !!facilitator.data && hasRecordEvidence(facilitator.data),
    hasAar: !!aar.data,
  }
  return {
    readiness: readiness(scenario, injects.data, lint.data, after),
    lintCount: lint.data?.length,
  }
}
