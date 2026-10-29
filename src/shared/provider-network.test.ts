// FR-1: which providers count as cloud providers.
import { describe, expect, it } from 'vitest'
import type { ProviderConfig } from './schemas/provider'
import {
  canTreatAsLocal,
  isLoopbackHost,
  isRemoteProvider,
  isRemoteRequest,
  providerHost,
} from './provider-network'

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

  it('honours "On my network, treat as local" for the LAN host it was granted for', () => {
    const lan = cfg({
      baseUrl: 'http://192.168.1.20:1234/v1',
      options: { network: 'local', localHost: '192.168.1.20' },
    })
    expect(isRemoteProvider(lan)).toBe(false)
    expect(canTreatAsLocal(lan)).toBe(true)
    // Without the granted host (an edited settings file), the mark does not apply.
    expect(isRemoteProvider({ ...lan, options: { network: 'local' } })).toBe(true)
  })

  it('never treats a public host as local (#454 review, finding 3)', () => {
    const openai = cfg({
      baseUrl: 'https://api.openai.com/v1',
      options: { network: 'local', localHost: 'api.openai.com' },
    })
    expect(canTreatAsLocal(openai)).toBe(false)
    expect(isRemoteProvider(openai)).toBe(true)
    for (const host of ['8.8.8.8', '172.32.0.1', 'gpu.example.com', '[2001:db8::1]'])
      expect(canTreatAsLocal(cfg({ baseUrl: `http://${host}:1234` })), host).toBe(false)
    for (const host of [
      '10.1.2.3',
      '172.20.0.5',
      '169.254.1.1',
      'gpu.local',
      'box.lan',
      '[fd00::5]',
    ])
      expect(canTreatAsLocal(cfg({ baseUrl: `http://${host}:1234` })), host).toBe(true)
  })

  it('drops the local mark when the base URL moves to another host', () => {
    const moved = cfg({
      baseUrl: 'http://10.0.0.9:1234/v1',
      options: { network: 'local', localHost: '192.168.1.20' },
    })
    expect(isRemoteProvider(moved)).toBe(true)
  })

  it('treats Ollama -cloud models as remote on a local daemon', () => {
    const ollama = cfg({ kind: 'ollama', baseUrl: 'http://127.0.0.1:11434' })
    expect(isRemoteRequest(ollama, 'qwen3:8b')).toBe(false)
    expect(isRemoteRequest(ollama, 'gpt-oss:120b-cloud')).toBe(true)
    expect(isRemoteRequest(ollama, 'deepseek-v3.1:671b-cloud')).toBe(true)
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
