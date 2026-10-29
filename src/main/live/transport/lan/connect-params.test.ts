import { describe, expect, it } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { parseConnectParams, parseJoinToken } from './connect-params'
import { Flood } from './peers'

const token = toBase64Url(new Uint8Array(16).fill(1))
const client = toBase64Url(new Uint8Array(16).fill(2))

describe('connect parameters (spec 0406: ?j=&c=&r=)', () => {
  it('accepts the three parameters, also with the `client` alias', () => {
    const p = parseConnectParams(new URLSearchParams({ j: token, c: client, r: token }))
    expect(p?.clientId).toBe(client)
    expect(p?.joinToken).toHaveLength(16)
    expect(parseConnectParams(new URLSearchParams({ j: token, client, r: token }))?.clientId).toBe(
      client,
    )
  })

  it('refuses missing, short, long and non-base64url values, and the id "server"', () => {
    const base = { j: token, c: client, r: token }
    expect(parseConnectParams(new URLSearchParams({ ...base, j: '' }))).toBeUndefined()
    expect(parseConnectParams(new URLSearchParams({ j: token, c: client }))).toBeUndefined()
    expect(
      parseConnectParams(new URLSearchParams({ ...base, r: toBase64Url(new Uint8Array(15)) })),
    ).toBeUndefined()
    expect(
      parseConnectParams(new URLSearchParams({ ...base, j: toBase64Url(new Uint8Array(32)) })),
    ).toBeUndefined()
    expect(parseConnectParams(new URLSearchParams({ ...base, c: 'server' }))).toBeUndefined()
    expect(parseConnectParams(new URLSearchParams({ ...base, c: client + '/..' }))).toBeUndefined()
    expect(
      parseConnectParams(new URLSearchParams({ ...base, j: 'not+base64url/==' })),
    ).toBeUndefined()
  })

  it('parses the join token alone for the blob route', () => {
    expect(parseJoinToken(new URLSearchParams({ j: token }))).toHaveLength(16)
    expect(parseJoinToken(new URLSearchParams({}))).toBeUndefined()
    expect(parseJoinToken(new URLSearchParams({ j: 'short' }))).toBeUndefined()
  })
})

describe('connection flood guard (spec 0407: 10/s per address, 10 s)', () => {
  it('drops an address past the burst for the ban window and forgets idle ones', () => {
    let t = 1_000_000
    const flood = new Flood(3, 10_000, () => t)
    expect([flood.hit('a'), flood.hit('a'), flood.hit('a')]).toEqual([false, false, false])
    expect(flood.hit('a')).toBe(true)
    expect(flood.hit('b')).toBe(false)
    t += 5_000
    expect(flood.hit('a')).toBe(true)
    t += 6_000
    expect(flood.hit('a')).toBe(false)
    t += 61_000
    flood.sweep()
    expect(flood.hit('a')).toBe(false)
  })
})
