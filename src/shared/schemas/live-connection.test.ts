// The connection shapes of spec 0410: each kind round-trips, a malformed fingerprint is refused,
// and a facilitator.json or settings.json written before live play still parses unchanged.
import { describe, expect, it } from 'vitest'
import { FacilitatorState } from '../ipc/facilitator'
import { LiveConnection } from './live'
import { AppSettings } from './settings'

const FP = Array.from({ length: 32 }, () => 'AB').join(':')

describe('LiveConnection', () => {
  it('round-trips each kind', () => {
    for (const c of [
      { kind: 'lan', address: '192.168.1.5', tls: 'none', port: 9000 },
      { kind: 'relay' },
      {
        kind: 'self-hosted',
        url: 'https://live.example.org',
        fingerprintSha256: FP,
        insecureHttp: false,
      },
    ]) {
      expect(LiveConnection.parse(c)).toEqual(c)
    }
  })

  it('defaults a self-hosted server to no plain http', () => {
    expect(LiveConnection.parse({ kind: 'self-hosted', url: 'https://a.example' })).toMatchObject({
      insecureHttp: false,
    })
  })

  it('refuses a malformed fingerprint', () => {
    for (const fingerprintSha256 of ['AB:CD', FP.toLowerCase(), `${FP}:00`]) {
      expect(
        LiveConnection.safeParse({
          kind: 'self-hosted',
          url: 'https://a.example',
          fingerprintSha256,
        }).success,
      ).toBe(false)
    }
  })
})

describe('older files', () => {
  it('parses a facilitator.json with no live key, and keeps a connection and consent', () => {
    expect(FacilitatorState.parse({}).live).toBeUndefined()
    const state = FacilitatorState.parse({
      live: { connection: { kind: 'relay' }, consented: ['relay'] },
    })
    expect(state.live).toEqual({ connection: { kind: 'relay' }, consented: ['relay'] })
  })

  it('parses settings with no live section to the LAN default and no servers', () => {
    expect(AppSettings.parse({}).live).toEqual({ defaultConnectionKind: 'lan', servers: [] })
  })
})
