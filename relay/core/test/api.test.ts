/** The adapter helpers: the connection contract, bodies, routes, tokens and the rate windows. */
import { describe, expect, it } from 'vitest'
import { toBase64Url, utf8 } from '@shared/live/bytes'
import {
  API_HEADERS,
  addressPrefix,
  bearerToken,
  constantTimeEqual,
  createRequestProblem,
  CreateSessionBody,
  hashBearerToken,
  hashJoinToken,
  JOIN_HEADER,
  KickBody,
  matchesAny,
  parseConnect,
  parseJoinHeader,
  parseSubprotocols,
  playerPageCsp,
  randomId,
  randomToken,
  RESUME_HEADER,
  sessionRoute,
  sha256Hex,
  SlidingWindow,
  WS_SUBPROTOCOL,
} from '../src'

const SESSION = 'session-00000000000000'
const A = 'playerA-00000000000000'
const join = toBase64Url(new Uint8Array(16).fill(1))
const resume = toBase64Url(new Uint8Array(16).fill(2))

describe('connection contract', () => {
  it('reads a WebSocket participant from ?client= and the subprotocols', () => {
    const r = parseConnect({
      query: new URLSearchParams({ client: A }),
      protocols: `${WS_SUBPROTOCOL}, j.${join}, r.${resume}`,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.auth.clientId).toBe(A)
      expect(r.auth.joinToken).toEqual(new Uint8Array(16).fill(1))
      expect(r.auth.resumeToken).toEqual(new Uint8Array(16).fill(2))
      expect(r.auth.controllerToken).toBeUndefined()
    }
    expect(parseSubprotocols('as-live.v1,j.abc,r.def')).toEqual({
      version: true,
      join: 'abc',
      resume: 'def',
    })
  })

  it('reads a controller from the bearer header and an SSE participant from the X-AS headers', () => {
    const c = parseConnect({
      query: new URLSearchParams({ client: A }),
      authorization: 'Bearer ' + 'b'.repeat(43),
      protocols: WS_SUBPROTOCOL,
    })
    expect(c).toEqual({ ok: true, auth: { clientId: A, controllerToken: 'b'.repeat(43) } })
    const s = parseConnect({
      query: new URLSearchParams({ client: A, after: '4' }),
      joinHeader: join,
      resumeHeader: resume,
    })
    expect(s.ok).toBe(true)
    expect(JOIN_HEADER).toBe('X-AS-Join')
    expect(RESUME_HEADER).toBe('X-AS-Resume')
  })

  it('refuses tokens in the query string, a missing client id, a missing subprotocol and short tokens', () => {
    expect(
      parseConnect({
        query: new URLSearchParams({ client: A, j: join, r: resume }),
        protocols: WS_SUBPROTOCOL,
      }),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN' })
    expect(parseConnect({ query: new URLSearchParams({ client: A, token: 'x' }) })).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    })
    expect(
      parseConnect({ query: new URLSearchParams({ c: A }), protocols: WS_SUBPROTOCOL }),
    ).toMatchObject({ ok: false, code: 'INVALID' })
    expect(
      parseConnect({ query: new URLSearchParams({ client: 'server' }), protocols: WS_SUBPROTOCOL }),
    ).toMatchObject({ ok: false, code: 'INVALID' })
    expect(
      parseConnect({
        query: new URLSearchParams({ client: A }),
        protocols: `j.${join}, r.${resume}`,
      }),
    ).toMatchObject({ ok: false, message: expect.stringContaining('as-live.v1') })
    expect(
      parseConnect({
        query: new URLSearchParams({ client: A }),
        protocols: `${WS_SUBPROTOCOL}, j.${toBase64Url(new Uint8Array(8))}, r.${resume}`,
      }),
    ).toMatchObject({ ok: false, code: 'INVALID' })
    expect(
      parseConnect({ query: new URLSearchParams({ client: A }), protocols: WS_SUBPROTOCOL }),
    ).toMatchObject({ ok: false, code: 'INVALID' })
    expect(
      parseConnect({ query: new URLSearchParams({ client: A }), joinHeader: join }),
    ).toMatchObject({ ok: false, code: 'INVALID' })
    expect(parseJoinHeader(join)).toEqual(new Uint8Array(16).fill(1))
    expect(parseJoinHeader('short')).toBeUndefined()
  })

  it('parses bearer tokens strictly', () => {
    expect(bearerToken('Bearer ' + 'a'.repeat(43))).toBe('a'.repeat(43))
    expect(bearerToken('  Bearer   abcdefghijklmnopqrstuvwxyz ')).toBe('abcdefghijklmnopqrstuvwxyz')
    expect(bearerToken('Basic abc')).toBeUndefined()
    expect(bearerToken('Bearer short')).toBeUndefined()
    expect(bearerToken(null)).toBeUndefined()
  })

  it('a session is created by the app: JSON, and never from a page', () => {
    const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null })
    expect(createRequestProblem(headers({ 'Content-Type': 'application/json' }))).toBeUndefined()
    expect(
      createRequestProblem(headers({ 'Content-Type': 'application/json; charset=utf-8' })),
    ).toBeUndefined()
    expect(createRequestProblem(headers({ 'Content-Type': 'text/plain' }))?.error.code).toBe(
      'UNSUPPORTED_MEDIA_TYPE',
    )
    expect(createRequestProblem(headers({}))?.error.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    expect(
      createRequestProblem(
        headers({ 'Content-Type': 'application/json', Origin: 'https://evil.example' }),
      )?.error.code,
    ).toBe('FORBIDDEN')
    expect(
      createRequestProblem(headers({ 'Content-Type': 'application/json', Origin: 'null' }))?.error
        .code,
    ).toBe('FORBIDDEN')
  })
})

describe('bodies and routes', () => {
  it('validates request bodies', () => {
    expect(CreateSessionBody.safeParse({ v: 1 }).success).toBe(true)
    expect(CreateSessionBody.safeParse({ v: 1, joinTokenHash: 'a'.repeat(64) }).success).toBe(true)
    expect(CreateSessionBody.safeParse({ v: 1, joinTokenHash: 'A'.repeat(64) }).success).toBe(false)
    expect(CreateSessionBody.safeParse({ v: 2 }).success).toBe(false)
    expect(CreateSessionBody.safeParse({ v: 1, name: 'x' }).success).toBe(false)
    expect(KickBody.safeParse({ client: A }).success).toBe(true)
    expect(KickBody.safeParse({ client: 'server' }).success).toBe(false)
  })

  it('parses session routes', () => {
    expect(sessionRoute(`/v1/sessions/${SESSION}/ws`)).toEqual({ sessionId: SESSION, action: 'ws' })
    expect(sessionRoute(`/v1/sessions/${SESSION}/join-token`)).toEqual({
      sessionId: SESSION,
      action: 'join-token',
    })
    expect(sessionRoute(`/v1/sessions/${SESSION}/events`)).toEqual({
      sessionId: SESSION,
      action: 'events',
    })
    expect(sessionRoute(`/v1/sessions/${SESSION}/blobs/${A}`)).toEqual({
      sessionId: SESSION,
      action: 'blob',
      blobId: A,
    })
    expect(sessionRoute(`/v1/sessions/${SESSION}/other`)).toBeUndefined()
    expect(sessionRoute(`/v1/sessions/short/ws`)).toBeUndefined()
    expect(sessionRoute(`/v1/sessions/${SESSION}/ws/`)).toBeUndefined()
    expect(sessionRoute(`/v1/sessions/${SESSION}/blobs/short`)).toBeUndefined()
  })

  it('fixes the headers and the player page policy', () => {
    expect(API_HEADERS['Cache-Control']).toBe('no-store')
    const csp = playerPageCsp(['wss://relay.example'])
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'self' wss://relay.example")
    expect(csp).toContain("frame-ancestors 'none'")
  })
})

describe('tokens', () => {
  it('mints ids of 22 and tokens of 43 base64url characters, all different', () => {
    const ids = new Set(Array.from({ length: 50 }, randomId))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(randomToken())
  })

  it('hashes with SHA-256 (hex) over text or bytes, and presented tokens only when long enough', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256Hex(utf8('abc'))).toBe(await hashBearerToken('abc'))
    expect(await hashJoinToken(join)).toHaveLength(64)
    expect(await hashJoinToken(toBase64Url(new Uint8Array(15)))).toBeUndefined()
    expect(await hashJoinToken('not base64url!')).toBeUndefined()
  })

  it('compares digests in constant time and against several candidates', () => {
    expect(constantTimeEqual('a'.repeat(64), 'a'.repeat(64))).toBe(true)
    expect(constantTimeEqual('a'.repeat(64), 'a'.repeat(63) + 'b')).toBe(false)
    expect(constantTimeEqual('a'.repeat(64), 'a'.repeat(63))).toBe(false)
    expect(matchesAny('b'.repeat(64), ['a'.repeat(64), 'b'.repeat(64)])).toBe(true)
    expect(matchesAny('c'.repeat(64), ['a'.repeat(64), 'b'.repeat(64)])).toBe(false)
    expect(matchesAny(undefined, ['a'.repeat(64)])).toBe(false)
    expect(matchesAny('', [''])).toBe(false)
  })
})

describe('rate windows', () => {
  it('counts hits per key, forgets them after the window, and prunes idle keys', () => {
    const window = new SlidingWindow<string>(2, 1000)
    expect(window.hit('a', 0)).toEqual({ ok: true })
    expect(window.hit('a', 100)).toEqual({ ok: true })
    expect(window.hit('a', 200)).toEqual({ ok: false, retryAfterMs: 800 })
    expect(window.hit('b', 200)).toEqual({ ok: true })
    expect(window.hit('a', 1001)).toEqual({ ok: true })
    window.prune(5000)
    expect(window.size).toBe(0)
    for (let i = 0; i < 300; i++) window.hit(`k${i}`, 10_000 + i)
    expect(window.size).toBeGreaterThanOrEqual(300)
    // Pruning runs every 256 hits: idle keys go once the window has passed.
    for (let i = 0; i < 256; i++) window.hit('late', 100_000 + i)
    expect(window.size).toBe(1)
  })

  it('caps the number of keys it remembers', () => {
    const window = new SlidingWindow<string>(5, 60_000, 10)
    for (let i = 0; i < 50; i++) window.hit(`k${i}`, i)
    expect(window.size).toBe(10)
  })

  it('groups addresses the way one person controls them: IPv4 as is, IPv6 by /64', () => {
    expect(addressPrefix('203.0.113.7')).toBe('203.0.113.7')
    expect(addressPrefix('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(addressPrefix('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64')
    expect(addressPrefix('2001:DB8::1')).toBe('2001:db8:0:0::/64')
    expect(addressPrefix('fe80::1%en0')).toBe('fe80:0:0:0::/64')
    expect(addressPrefix('nonsense')).toBe('nonsense')
  })
})
