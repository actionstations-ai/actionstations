/**
 * The small parts the hub is built from: frame checks, tokens, rate limiters and the HTTP
 * shapes shared by every adapter.
 */
import { describe, expect, it } from 'vitest'
import { toBase64Url, utf8 } from '@shared/live/bytes'
import { LIMITS } from '@shared/live/protocol'
import {
  API_HEADERS,
  bearerToken,
  CreateSessionBody,
  KickBody,
  playerPageCsp,
  sessionRoute,
  wsAuth,
} from '../src/api'
import { checkFrame } from '../src/frames'
import { announcedLimits, HUB_LIMITS } from '../src/limits'
import { SlidingWindow, TokenBucket } from '../src/quota'
import {
  constantTimeEqual,
  hashBearerToken,
  hashJoinToken,
  hashResumeToken,
  matchesAny,
  randomId,
  randomToken,
  sha256Hex,
} from '../src/tokens'
import { frame } from './conformance'

const SESSION = 'session-00000000000000'
const A = 'playerA-00000000000000'

describe('checkFrame', () => {
  it('accepts an envelope and returns it with the original text', () => {
    const text = frame({ session: SESSION, from: A, to: 'all', type: 'message.send', seq: 1 })
    const r = checkFrame(text, LIMITS.relay)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.frame).toBe(text)
      expect(r.envelope.type).toBe('message.send')
    }
  })

  it('refuses binary, oversize, non-JSON and off-schema frames with the right code', () => {
    expect(checkFrame(new Uint8Array([1, 2, 3]), LIMITS.relay)).toMatchObject({
      ok: false,
      code: 'INVALID',
    })
    expect(checkFrame(new ArrayBuffer(4), LIMITS.relay)).toMatchObject({
      ok: false,
      code: 'INVALID',
    })
    expect(checkFrame('x'.repeat(LIMITS.relay.envelopeBytes + 1), LIMITS.relay)).toMatchObject({
      ok: false,
      code: 'TOO_LARGE',
    })
    // Multi-byte characters: measured in bytes, not characters.
    expect(checkFrame('é'.repeat(LIMITS.relay.envelopeBytes / 2 + 1), LIMITS.relay)).toMatchObject({
      ok: false,
      code: 'TOO_LARGE',
    })
    expect(checkFrame('{', LIMITS.relay)).toMatchObject({ ok: false, code: 'INVALID' })
    expect(checkFrame('[]', LIMITS.relay)).toMatchObject({ ok: false, code: 'INVALID' })
    expect(checkFrame(JSON.stringify({ v: 2 }), LIMITS.relay)).toMatchObject({
      ok: false,
      code: 'INVALID',
    })
  })

  it('refuses a payload that is not an object, so a server never has to look inside one', () => {
    const text = frame({
      session: SESSION,
      from: A,
      to: 'all',
      type: 'message.send',
      seq: 1,
    }).replace(/"payload":\{[^}]*\}/, '"payload":"text"')
    expect(checkFrame(text, LIMITS.relay)).toMatchObject({ ok: false, code: 'INVALID' })
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

  it('hashes with SHA-256 (hex) over text or bytes', async () => {
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await sha256Hex(utf8('abc'))).toBe(await hashBearerToken('abc'))
  })

  it('hashes presented tokens only when they decode to enough bytes', async () => {
    const sixteen = toBase64Url(new Uint8Array(16).fill(7))
    expect(await hashJoinToken(sixteen)).toHaveLength(64)
    expect(await hashResumeToken(sixteen)).toHaveLength(64)
    expect(await hashJoinToken(toBase64Url(new Uint8Array(15)))).toBeUndefined()
    expect(await hashJoinToken(undefined)).toBeUndefined()
    expect(await hashJoinToken('')).toBeUndefined()
    expect(await hashJoinToken('not base64url!')).toBeUndefined()
    expect(await hashJoinToken('a'.repeat(200))).toBeUndefined()
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

describe('rate limiters', () => {
  it('a token bucket allows the burst, then refills at the rate and says when to retry', () => {
    const bucket = new TokenBucket(3, 60, 0)
    expect(bucket.take(0)).toEqual({ ok: true })
    expect(bucket.take(0)).toEqual({ ok: true })
    expect(bucket.take(0)).toEqual({ ok: true })
    expect(bucket.take(0)).toEqual({ ok: false, retryAfterMs: 1000 })
    expect(bucket.take(500)).toEqual({ ok: false, retryAfterMs: 500 })
    expect(bucket.take(1000)).toEqual({ ok: true })
    expect(bucket.take(100_000)).toEqual({ ok: true })
    expect(bucket.take(100_000)).toEqual({ ok: true })
    expect(bucket.take(100_000)).toEqual({ ok: true })
    expect(bucket.take(100_000).ok).toBe(false)
  })

  it('a sliding window counts hits per key and forgets them after the window', () => {
    const window = new SlidingWindow<string>(2, 1000)
    expect(window.hit('a', 0)).toEqual({ ok: true })
    expect(window.hit('a', 100)).toEqual({ ok: true })
    expect(window.hit('a', 200)).toEqual({ ok: false, retryAfterMs: 800 })
    expect(window.hit('b', 200)).toEqual({ ok: true })
    expect(window.hit('a', 1001)).toEqual({ ok: true })
    window.prune(5000)
    expect(window.size).toBe(0)
  })
})

describe('limits', () => {
  it('announces the protocol subset of the hub limits', () => {
    expect(announcedLimits(HUB_LIMITS.relay)).toEqual(LIMITS.relay)
    expect(announcedLimits(HUB_LIMITS['self-hosted'])).toEqual(LIMITS['self-hosted'])
    expect(HUB_LIMITS.relay.storedEnvelopes).toBe(4000)
    expect(HUB_LIMITS.relay.rates.reconnectsPerHour).toBe(20)
  })
})

describe('api', () => {
  it('parses bearer tokens strictly', () => {
    expect(bearerToken('Bearer ' + 'a'.repeat(43))).toBe('a'.repeat(43))
    expect(bearerToken('  Bearer   abcdefghijklmnopqrstuvwxyz ')).toBe('abcdefghijklmnopqrstuvwxyz')
    expect(bearerToken('Basic abc')).toBeUndefined()
    expect(bearerToken('Bearer short')).toBeUndefined()
    expect(bearerToken('Bearer with space ' + 'a'.repeat(20))).toBeUndefined()
    expect(bearerToken(null)).toBeUndefined()
  })

  it('reads who is connecting from the query or the bearer header', () => {
    const q = new URLSearchParams({
      c: A,
      j: 'jointoken_aaaaaaaaaaaa',
      r: 'resume_aaaaaaaaaaaaaaaa',
    })
    expect(wsAuth(q, null)).toEqual({
      clientId: A,
      joinToken: 'jointoken_aaaaaaaaaaaa',
      resumeToken: 'resume_aaaaaaaaaaaaaaaa',
    })
    expect(wsAuth(q, 'Bearer ' + 'b'.repeat(43))).toEqual({
      clientId: A,
      controllerToken: 'b'.repeat(43),
    })
    expect(wsAuth(new URLSearchParams({ j: 'x' }), null)).toBeUndefined()
    expect(wsAuth(new URLSearchParams({ c: 'server' }), null)).toBeUndefined()
    expect(wsAuth(new URLSearchParams({ c: 'too-short' }), null)).toBeUndefined()
  })

  it('validates request bodies and routes', () => {
    expect(CreateSessionBody.safeParse({ v: 1 }).success).toBe(true)
    expect(CreateSessionBody.safeParse({ v: 1, joinTokenHash: 'a'.repeat(64) }).success).toBe(true)
    expect(CreateSessionBody.safeParse({ v: 1, joinTokenHash: 'A'.repeat(64) }).success).toBe(false)
    expect(CreateSessionBody.safeParse({ v: 2 }).success).toBe(false)
    expect(CreateSessionBody.safeParse({ v: 1, name: 'x' }).success).toBe(false)
    expect(KickBody.safeParse({ client: A }).success).toBe(true)
    expect(KickBody.safeParse({ client: 'server' }).success).toBe(false)
    expect(sessionRoute(`/v1/sessions/${SESSION}/ws`)).toEqual({ sessionId: SESSION, action: 'ws' })
    expect(sessionRoute(`/v1/sessions/${SESSION}/join-token`)).toEqual({
      sessionId: SESSION,
      action: 'join-token',
    })
    expect(sessionRoute(`/v1/sessions/${SESSION}/other`)).toBeUndefined()
    expect(sessionRoute(`/v1/sessions/short/ws`)).toBeUndefined()
    expect(sessionRoute(`/v1/sessions/${SESSION}/ws/`)).toBeUndefined()
  })

  it('fixes the headers and the player page policy', () => {
    expect(API_HEADERS['Cache-Control']).toBe('no-store')
    const csp = playerPageCsp(['wss://relay.example'])
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("connect-src 'self' wss://relay.example")
    expect(csp).toContain("frame-ancestors 'none'")
  })
})
