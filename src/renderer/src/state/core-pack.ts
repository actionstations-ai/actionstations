// The core pack included with the app (ADR-0020), for the "Included: Action Stations Core"
// badge on default prompts and workflows (their default layer is the core pack's).
import type { Provenance } from '../lib/provenance'
import { useIpcQuery } from '../lib/query'

/** Badge data for an item of the core pack, once packs:list has answered. */
export function useCorePackProvenance(): Provenance | undefined {
  const list = useIpcQuery('packs:list', undefined, { staleTime: Infinity })
  const core = list.data?.find((p) => p.core)
  return core ? { origin: 'pack', bundled: true, packId: core.id, packName: core.name } : undefined
}
