/**
 * The co-controller roster of a regional exercise on the live connection (spec 0440 FR-19). The
 * host sends its signed `controller.roster` to every device, so a device accepts a release from
 * a partner organization's controller only inside that organization's rows and roles. Nothing
 * is sent for a scenario that is not a regional exercise hosted from this computer.
 */
import type { ControllerRosterPayload } from '@shared/live/schemas'
import type { RegionalRosterView } from '@shared/schemas/live'
import { hasRegional } from '../regional/store'
import { rosterFor } from '../regional/manage'

/** The roster to send, or undefined when this scenario has no partner controllers to list. */
export async function hostRoster(
  root: string,
  scenarioId: string,
  revision: number,
): Promise<{ roster: ControllerRosterPayload; missingLiveKey: string[] } | undefined> {
  if (!(await hasRegional(root, scenarioId))) return undefined
  try {
    const { roster, missingLiveKey } = await rosterFor(root, scenarioId, revision)
    return { roster, missingLiveKey }
  } catch {
    // A partner's copy of the exercise is not the host's: no roster to send.
    return undefined
  }
}

/** What the Live tab shows about the roster: who may release what, and who cannot yet. */
export function rosterView(
  sent: ControllerRosterPayload | undefined,
  missingLiveKey: readonly string[],
): RegionalRosterView {
  return {
    sent: sent !== undefined,
    ...(sent ? { revision: sent.revision } : {}),
    controllers: (sent?.controllers ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      rowPrefixes: c.scope.rowPrefixes,
      roleCount: c.scope.roleIds.length,
    })),
    missingLiveKey: [...missingLiveKey],
  }
}
