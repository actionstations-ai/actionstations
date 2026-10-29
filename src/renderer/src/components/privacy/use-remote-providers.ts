// Cloud providers a project (or the app) sends to, for the review-off confirmation (#433).
import type { ProviderRouting } from '@shared/schemas'
import { isRemoteProvider } from '@shared/provider-network'
import { useIpcQuery } from '../../lib/query'

/** Labels of cloud providers in use: those a routing names, else every enabled cloud provider. */
export function useRemoteProviderLabels(projectPath?: string): string[] {
  const providers = useIpcQuery('providers:list', undefined)
  const routing = useIpcQuery('routing:get', projectPath ? { projectPath } : {})
  const remote = (providers.data ?? []).filter((p) => p.enabled && isRemoteProvider(p))
  const routed = new Set(
    Object.values((routing.data?.effective ?? {}) as ProviderRouting).map((r) => r?.providerId),
  )
  const inUse = remote.filter((p) => routed.has(p.id))
  return (inUse.length ? inUse : remote).map((p) => p.label)
}
