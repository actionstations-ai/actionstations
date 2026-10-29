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

/** RFC 1918, link-local (169.254/16), IPv6 unique-local (fc00::/7) and link-local (fe80::/10). */
export function isPrivateNetworkHost(host: string): boolean {
  const h = host
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (v4) {
    if (v4.slice(1).some((n) => Number(n) > 255)) return false
    const a = Number(v4[1])
    const b = Number(v4[2])
    return (
      a === 10 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    )
  }
  if (h.includes(':')) return /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h)
  // mDNS and home-network names resolve inside the network.
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(local|lan|home\.arpa|internal)$/.test(h)
}

/**
 * Whether the user may mark this provider "On my network, treat as local": only a private
 * network address or a .local / .lan name, never a public host or a vendor cloud.
 */
export function canTreatAsLocal(config: Pick<ProviderConfig, 'kind' | 'baseUrl'>): boolean {
  if (ALWAYS_REMOTE.has(config.kind)) return false
  const host = providerHost(config)
  return host !== '' && !isLoopbackHost(host) && isPrivateNetworkHost(host)
}

/**
 * The host the user marked as local, when the mark still applies: it must name the provider's
 * current host (a changed base URL needs the box ticked again) and that host must be private.
 */
export function grantedLocalHost(
  config: Pick<ProviderConfig, 'kind' | 'baseUrl' | 'options'>,
): string | undefined {
  if (networkOption(config) !== 'local' || !canTreatAsLocal(config)) return undefined
  const granted = config.options?.localHost
  return typeof granted === 'string' && granted === providerHost(config) ? granted : undefined
}

/** FR-1: true when requests to this provider leave the computer. */
export function isRemoteProvider(
  config: Pick<ProviderConfig, 'kind' | 'baseUrl' | 'options'>,
): boolean {
  if (ALWAYS_REMOTE.has(config.kind)) return true
  if (networkOption(config) === 'remote') return true
  const host = providerHost(config)
  if (host === '' || isLoopbackHost(host)) return false
  return grantedLocalHost(config) === undefined
}

/**
 * Ollama cloud models (names ending in `-cloud` or `:cloud`) run on ollama.com: the local daemon
 * forwards the request. Such a model is remote even on a loopback Ollama.
 */
export const OLLAMA_CLOUD_HOST = 'ollama.com'

export function isCloudModel(kind: ProviderConfig['kind'], model: string | undefined): boolean {
  return kind === 'ollama' && !!model && /[-:]cloud$/i.test(model.trim())
}

/** Kinds whose individual models may run in a vendor cloud through a local server. */
export const hasCloudModels = (kind: ProviderConfig['kind']): boolean => kind === 'ollama'

/** Whether a request to this provider with this model leaves the computer. */
export function isRemoteRequest(
  config: Pick<ProviderConfig, 'kind' | 'baseUrl' | 'options'>,
  model: string | undefined,
): boolean {
  return isRemoteProvider(config) || isCloudModel(config.kind, model)
}
