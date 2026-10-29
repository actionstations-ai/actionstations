// FR-1: which providers count as cloud providers.
import { describe, expect, it } from 'vitest'
import type { ProviderConfig } from './schemas/provider'
import { canTreatAsLocal, isLoopbackHost, isRemoteProvider, providerHost } from './provider-network'

const cfg = (p: Partial<ProviderConfig>): ProviderConfig => ({
  id: 'p',
  kind: 'openai-compatible',
  label: 'P',
  options: {},
  enabled: true,
  ...p,
})

describe('isLoopbackHost', () => {
  it.each(['127.0.0.1', '127.1.2.3', 'localhost', 'LOCALHOST.', 'api.localhost', '::1', '[::1]'])(
    '%s is loopback',
    (h) => expect(isLoopbackHost(h)).toBe(true),
  )
  it.each(['192.168.1.20', '10.0.0.5', 'gpu.local', 'api.anthropic.com', '128.0.0.1', '::2'])(
    '%s is not loopback',
    (h) => expect(isLoopbackHost(h)).toBe(false),
  )
})

describe('isRemoteProvider', () => {
  it('treats Anthropic as remote, whatever the base URL or option says', () => {
    expect(isRemoteProvider(cfg({ kind: 'anthropic' }))).toBe(true)
    expect(
      isRemoteProvider(
        cfg({ kind: 'anthropic', baseUrl: 'http://127.0.0.1:9', options: { network: 'local' } }),
      ),
    ).toBe(true)
  })

  it('treats loopback servers as local', () => {
    expect(isRemoteProvider(cfg({ baseUrl: 'http://127.0.0.1:1234/v1' }))).toBe(false)
    expect(isRemoteProvider(cfg({ kind: 'ollama', baseUrl: 'http://localhost:11434' }))).toBe(false)
    expect(isRemoteProvider(cfg({ baseUrl: 'http://[::1]:8000/v1' }))).toBe(false)
  })

  it('treats LAN and internet hosts as remote by default', () => {
    expect(isRemoteProvider(cfg({ baseUrl: 'http://192.168.1.20:1234/v1' }))).toBe(true)
    expect(isRemoteProvider(cfg({ kind: 'comfyui', baseUrl: 'http://gpu.local:8188' }))).toBe(true)
    expect(isRemoteProvider(cfg({ baseUrl: 'https://openrouter.ai/api/v1' }))).toBe(true)
  })

  it('honours "On my network, treat as local" for a LAN host', () => {
    const lan = cfg({ baseUrl: 'http://192.168.1.20:1234/v1', options: { network: 'local' } })
    expect(isRemoteProvider(lan)).toBe(false)
    expect(canTreatAsLocal(lan)).toBe(true)
  })

  it('treats on-device providers with no host as local unless forced remote', () => {
    expect(isRemoteProvider(cfg({ kind: 'system-tts' }))).toBe(false)
    expect(isRemoteProvider(cfg({ kind: 'mock' }))).toBe(false)
    expect(isRemoteProvider(cfg({ kind: 'mock', options: { network: 'remote' } }))).toBe(true)
  })

  it('ignores an invalid network option', () => {
    expect(isRemoteProvider(cfg({ baseUrl: 'http://10.0.0.5', options: { network: 'yes' } }))).toBe(
      true,
    )
  })
})

describe('providerHost and canTreatAsLocal', () => {
  it('names the host requests go to', () => {
    expect(providerHost(cfg({ kind: 'anthropic' }))).toBe('api.anthropic.com')
    expect(providerHost(cfg({ baseUrl: 'http://[::1]:8000/v1' }))).toBe('::1')
    expect(providerHost(cfg({ kind: 'system-tts' }))).toBe('')
  })

  it('offers the local option only for non-loopback, non-vendor hosts', () => {
    expect(canTreatAsLocal(cfg({ kind: 'anthropic' }))).toBe(false)
    expect(canTreatAsLocal(cfg({ baseUrl: 'http://127.0.0.1:1234' }))).toBe(false)
    expect(canTreatAsLocal(cfg({ baseUrl: 'http://192.168.0.9:1234' }))).toBe(true)
  })
})
