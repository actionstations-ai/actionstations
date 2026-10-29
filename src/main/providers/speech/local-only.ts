// Transcription stays on this computer (#425, spec 0425 FR-3). Checked when the provider is
// resolved and again by an adapter before each request, so an edited settings.json cannot
// route hot wash audio to another machine.
import type { ProviderConfig, ProviderKind } from '@shared/schemas'
import { AppError } from '../../lib/errors'

/** Kinds that run on this computer by construction (no base URL to check). */
const ON_DEVICE_KINDS = new Set<ProviderKind>(['local-whisper', 'mock'])

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function isLoopbackIpv4(host: string): boolean {
  const m = IPV4.exec(host)
  return !!m && m.slice(1).every((o) => Number(o) <= 255) && m[1] === '127'
}

/** ::ffff:7f00:1 (how URL writes ::ffff:127.0.0.1) and the dotted form. */
function isMappedLoopback(host: string): boolean {
  const rest = /^::ffff:(.+)$/i.exec(host)?.[1]
  if (!rest) return false
  if (isLoopbackIpv4(rest)) return true
  const hi = /^([0-9a-f]{1,4}):[0-9a-f]{1,4}$/i.exec(rest)?.[1]
  return !!hi && parseInt(hi, 16) >> 8 === 127
}

/**
 * True only for http(s) URLs whose host is this computer: 127.0.0.0/8, ::1, an IPv4-mapped
 * loopback address, or the name `localhost`. Names that merely start with "localhost" do not
 * count. The URL parser normalises short forms such as 127.1 first.
 */
export function isLoopbackUrl(url: string | undefined): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost') return true
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  return isLoopbackIpv4(host) || isMappedLoopback(host)
}

/** The provider runs on this computer: a built-in kind, or a loopback base URL. */
export function isLocalSpeechProvider(config: ProviderConfig): boolean {
  return ON_DEVICE_KINDS.has(config.kind) || isLoopbackUrl(config.baseUrl)
}

/** Transcription never leaves this computer (spec 0425 FR-3): refuse any other provider. */
export function assertLocalSpeechProvider(config: ProviderConfig): void {
  if (isLocalSpeechProvider(config)) return
  throw new AppError(
    'PROVIDER',
    `Transcription runs only on this computer. "${config.label}" is not a local server, so the hot wash audio is not sent to it. Choose the built-in Whisper model or a server on this computer in Providers › Routing.`,
  )
}
