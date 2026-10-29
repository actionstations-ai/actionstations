// Transcription stays on this computer (#425 FR-3): the loopback guard's decision table.
import { describe, expect, it } from 'vitest'
import type { ProviderConfig } from '@shared/schemas'
import { assertLocalSpeechProvider, isLocalSpeechProvider, isLoopbackUrl } from './local-only'

describe('isLoopbackUrl', () => {
  it.each([
    'http://127.0.0.1:8080',
    'http://127.1:8080/v1',
    'http://127.255.0.9',
    'http://localhost:8000/v1',
    'http://LOCALHOST:8000',
    'http://[::1]:8765/v1',
    'http://[0:0:0:0:0:0:0:1]:8000',
    'http://[::ffff:127.0.0.1]:8080',
    'https://localhost/v1',
  ])('accepts %s', (url) => expect(isLoopbackUrl(url)).toBe(true))

  it.each([
    'http://localhost.example.com:8080',
    'http://127.0.0.1.nip.io',
    'http://128.0.0.1',
    'http://10.0.0.5:8080',
    'http://192.168.1.20:8000',
    'http://[::ffff:10.0.0.1]',
    'http://0.0.0.0:8080',
    'https://api.openai.com/v1',
    'file:///etc/passwd',
    'not a url',
    undefined,
  ])('refuses %s', (url) => expect(isLoopbackUrl(url)).toBe(false))
})

const config = (kind: ProviderConfig['kind'], baseUrl?: string): ProviderConfig => ({
  id: 'p',
  kind,
  label: 'Server',
  options: {},
  enabled: true,
  ...(baseUrl ? { baseUrl } : {}),
})

describe('assertLocalSpeechProvider', () => {
  it('accepts the built-in and mock providers and local servers', () => {
    expect(isLocalSpeechProvider(config('local-whisper'))).toBe(true)
    expect(isLocalSpeechProvider(config('mock'))).toBe(true)
    expect(() =>
      assertLocalSpeechProvider(config('openai-compatible', 'http://127.0.0.1:8080/v1')),
    ).not.toThrow()
  })

  it('refuses a provider on another machine with a message that says why', () => {
    expect(() =>
      assertLocalSpeechProvider(config('openai-compatible', 'https://api.openai.com/v1')),
    ).toThrow(/runs only on this computer/)
    expect(() => assertLocalSpeechProvider(config('openai-compatible'))).toThrow()
  })
})
