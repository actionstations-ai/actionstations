// Which providers are cloud providers (#433, FR-1). One rule for text, embedding and media
// providers, shared by the outbound gate in main and the Cloud marker in the renderer.
// A provider is remote when its kind is `anthropic` or its host is not a loopback address.
// LAN hosts count as remote unless the user marks the provider "On my network, treat as local"
// (options.network = 'local'); options.network = 'remote' forces remote (tests use it on mock).
import type { ProviderConfig } from './schemas/provider'

/** Kinds that always call a vendor's cloud API, whatever the base URL says. */
const ALWAYS_REMOTE = new Set<ProviderConfig['kind']>(['anthropic'])

/** The host an adapter talks to when no base URL is stored. */
const DEFAULT_HOSTS: Partial<Record<ProviderConfig['kind'], string>> = {
  anthropic: 'api.anthropic.com',
}

/** `127.0.0.0/8`, `::1` and `localhost` (with or without brackets / a trailing dot). */
export function isLoopbackHost(host: string): boolean {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '::1' || h === '0:0:0:0:0:0:0:1') return true
  if (/^::ffff:127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  return !!v4 && Number(v4[1]) === 127 && v4.slice(2).every((n) => Number(n) <= 255)
}

/** The host requests go to, or '' when the provider has none (built-in or on-device). */
export function providerHost(config: Pick<ProviderConfig, 'kind' | 'baseUrl'>): string {
  if (config.baseUrl) {
    try {
      return new URL(config.baseUrl).hostname.replace(/^\[|\]$/g, '')
    } catch {
      return config.baseUrl
    }
  }
  return DEFAULT_HOSTS[config.kind] ?? ''
}

/** The stored per-provider choice, when it is a valid one. */
export function networkOption(
  config: Pick<ProviderConfig, 'options'>,
): 'local' | 'remote' | undefined {
  const v = config.options?.network
  return v === 'local' || v === 'remote' ? v : undefined
}

/** Whether a provider's host is one the user may mark as local (not loopback, not a vendor cloud). */
export function canTreatAsLocal(config: Pick<ProviderConfig, 'kind' | 'baseUrl'>): boolean {
  if (ALWAYS_REMOTE.has(config.kind)) return false
  const host = providerHost(config)
  return host !== '' && !isLoopbackHost(host)
}

/** FR-1: true when requests to this provider leave the computer. */
export function isRemoteProvider(
  config: Pick<ProviderConfig, 'kind' | 'baseUrl' | 'options'>,
): boolean {
  if (ALWAYS_REMOTE.has(config.kind)) return true
  const option = networkOption(config)
  if (option === 'remote') return true
  const host = providerHost(config)
  if (host === '' || isLoopbackHost(host)) return false
  return option !== 'local'
}
