import { describe, expect, it } from 'vitest'
import { credentialLikeOption } from './providers'

describe('provider options never hold a credential (keys live in the OS keychain)', () => {
  it('refuses credential names, at any depth', () => {
    for (const name of [
      'apiKey',
      'api_key',
      'key',
      'accessKey',
      'openaiKey',
      'secret',
      'clientSecret',
      'password',
      'credentials',
      'token',
      'accessToken',
      'Authorization',
    ]) {
      expect(credentialLikeOption({ [name]: 'x' }), name).toBe(name)
    }
    expect(
      credentialLikeOption({
        headers: { 'HTTP-Referer': 'https://actionstations.ai', 'x-api-key': 'abc' },
      }),
    ).toBe('headers.x-api-key')
    expect(credentialLikeOption({ headers: { Authorization: 'Bearer abc' } })).toBe(
      'headers.Authorization',
    )
  })

  it('refuses a value that is a key, whatever its name', () => {
    expect(credentialLikeOption({ note: 'sk-proj-abcdefghijklmnop' })).toBe('note')
    expect(credentialLikeOption({ headers: { 'X-Custom': 'Bearer abcdefghijklmnop' } })).toBe(
      'headers.X-Custom',
    )
  })

  it('accepts ordinary options, including names that mention tokens', () => {
    expect(
      credentialLikeOption({
        preset: 'openai',
        maxTokensParam: 'max_completion_tokens',
        inputUsdPerMTok: 2,
        apiVersion: '2025-04-01-preview',
        jsonMode: 'json_schema',
        headers: { 'HTTP-Referer': 'https://actionstations.ai', 'X-Title': 'Action Stations' },
        voices: { PIO: 'marin' },
      }),
    ).toBeUndefined()
  })
})
