import { describe, expect, it } from 'vitest'
import { toBase64Url } from '@shared/live/bytes'
import { JOIN_HEADER, RESUME_HEADER, WS_SUBPROTOCOL } from '@shared/live/connect-url'
import { parseConnectParams, parseJoinToken } from './connect-params'
import { Flood } from './peers'

const token = toBase64Url(new Uint8Array(16).fill(1))
const resume = toBase64Url(new Uint8Array(16).fill(3))
const client = toBase64Url(new Uint8Array(16).fill(2))
const search = (extra: Record<string, string> = {}) => new URLSearchParams({ client, ...extra })
const protocols = [WS_SUBPROTOCOL, `j.${token}`, `r.${resume}`].join(', ')
const headers = { [JOIN_HEADER]: token, [RESUME_HEADER]: resume }

describe('connect parameters (connect-url.ts contract: client in the query, tokens out of it)', () => {
  it('accepts a WebSocket upgrade with the version subprotocol and both token entries', () => {
    const r = parseConnectParams({ search: search(), protocols })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.params.clientId).toBe(client)
      expect(r.params.joinToken).toEqual(new Uint8Array(16).fill(1))
      expect(r.params.resumeToken).toEqual(new Uint8Array(16).fill(3))
    }
  })

  it('accepts a fallback request with the X-AS-Join and X-AS-Resume headers', () => {
    const r = parseConnectParams({ search: search({ after: '12' }), headers })
    expect(r.ok).toBe(true)
  })

  it('refuses a token in the query string, whatever else is present', () => {
    for (const name of ['j', 'r', 'join', 'resume', 'token']) {
      const r = parseConnectParams({ search: search({ [name]: token }), headers })
      expect(r).toEqual({ ok: false, reason: 'TOKEN_IN_QUERY' })
    }
  })

  it('refuses an upgrade without the version subprotocol, and missing or malformed tokens', () => {
    expect(parseConnectParams({ search: search(), protocols: `j.${token}, r.${resume}` })).toEqual({
      ok: false,
      reason: 'BAD_PROTOCOL',
    })
    expect(parseConnectParams({ search: search(), protocols: WS_SUBPROTOCOL })).toEqual({
      ok: false,
      reason: 'MALFORMED',
    })
    expect(
      parseConnectParams({ search: search(), protocols: `${WS_SUBPROTOCOL}, j.${token}` }),
    ).toEqual({ ok: false, reason: 'MALFORMED' }) // no resume token
    const short = toBase64Url(new Uint8Array(15))
    expect(
      parseConnectParams({ search: search(), headers: { ...headers, [RESUME_HEADER]: short } }),
    ).toEqual({ ok: false, reason: 'MALFORMED' })
    expect(parseConnectParams({ search: new URLSearchParams(), headers })).toEqual({
      ok: false,
      reason: 'MALFORMED',
    })
    expect(parseConnectParams({ search: search({ client: 'server' }), headers })).toEqual({
      ok: false,
      reason: 'MALFORMED',
    })
    expect(parseConnectParams({ search: search({ client: `${client}/..` }), headers })).toEqual({
      ok: false,
      reason: 'MALFORMED',
    })
  })

  it('parses the join token alone from the header for the blob route', () => {
    expect(parseJoinToken({ [JOIN_HEADER]: token })).toHaveLength(16)
    expect(parseJoinToken({})).toBeUndefined()
    expect(parseJoinToken({ [JOIN_HEADER]: 'short' })).toBeUndefined()
    expect(parseJoinToken({ [JOIN_HEADER]: toBase64Url(new Uint8Array(32)) })).toBeUndefined()
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
