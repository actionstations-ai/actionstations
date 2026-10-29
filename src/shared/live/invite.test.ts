import { describe, expect, it } from 'vitest'
import { bytesEqual, fromBase64Url, toBase64Url } from './bytes'
import { createWebCryptoProvider } from './crypto/webcrypto'
import { IDS } from './fixtures/payloads'
import { makeController } from './fixtures/setup'
import {
  buildInvite,
  buildInviteFragment,
  InviteError,
  parseInvite,
  parseInviteFragment,
  publicJoinUrl,
} from './invite'

const crypto = createWebCryptoProvider()

describe('invite link', () => {
  it('round-trips a players link, a staff link and a role hint', async () => {
    const ctl = await makeController(crypto)
    for (const kind of ['players', 'staff'] as const) {
      const url = ctl.invite(kind, kind === 'players' ? 'ops-director' : 'evaluator')
      const parsed = parseInvite(url)
      expect(parsed.base).toBe('https://relay.example')
      expect(parsed.sessionId).toBe(IDS.session)
      expect(parsed.epoch).toBe(1)
      expect(parsed.key.kind).toBe(kind)
      expect(bytesEqual(parsed.key.root, ctl.keys.root(kind)!)).toBe(true)
      expect(bytesEqual(parsed.controllerPub, ctl.controllerPub)).toBe(true)
      expect(bytesEqual(parsed.controllerEcdhPub, ctl.keys.controllerEcdhPub!)).toBe(true)
      expect(parsed.roleHint).toBe(kind === 'players' ? 'ops-director' : 'evaluator')
    }
    const plain = parseInvite(ctl.invite('players'))
    expect(plain.roleHint).toBeUndefined()
  })

  it('stays under 300 characters with a role hint, and the fragment is 220 characters', async () => {
    const ctl = await makeController(crypto)
    const url = ctl.invite('players', 'ops-director')
    expect(url.length).toBeLessThan(300)
    expect(
      buildInviteFragment({
        epoch: 1,
        key: { kind: 'players', root: ctl.keys.root('players')! },
        controllerPub: ctl.controllerPub,
        controllerEcdhPub: ctl.keys.controllerEcdhPub!,
      }).length,
    ).toBe(220)
  })

  it('never puts the fragment in the public join URL', async () => {
    const ctl = await makeController(crypto)
    const url = ctl.invite('players')
    expect(publicJoinUrl('https://relay.example/', IDS.session)).toBe(
      url.slice(0, url.indexOf('#')),
    )
  })

  it('encodes the epoch big-endian so a rotated link parses back', () => {
    const root = crypto.random(32)
    const pub = new Uint8Array(65)
    pub[0] = 4
    const fragment = buildInviteFragment({
      epoch: 258,
      key: { kind: 'staff', root },
      controllerPub: pub,
      controllerEcdhPub: pub,
    })
    const bytes = fromBase64Url(fragment)
    expect(bytes[0]).toBe(0x02)
    expect([bytes[1], bytes[2]]).toEqual([1, 2])
    expect(parseInviteFragment(fragment).epoch).toBe(258)
  })

  it('refuses an unknown layout byte with a message asking for a new link', () => {
    const bytes = new Uint8Array(165)
    bytes[0] = 0x07
    bytes[3 + 32] = 4
    bytes[3 + 32 + 65] = 4
    expect(() => parseInviteFragment(toBase64Url(bytes))).toThrow(InviteError)
    try {
      parseInviteFragment(toBase64Url(bytes))
    } catch (err) {
      expect((err as InviteError).code).toBe('UNKNOWN_LAYOUT')
      expect((err as InviteError).message).toMatch(/new link/)
    }
  })

  it('refuses truncated, padded, malformed and keyless links', async () => {
    const ctl = await makeController(crypto)
    const url = ctl.invite('players')
    const codes = (bad: string) => {
      try {
        parseInvite(bad)
        return 'parsed'
      } catch (err) {
        return (err as InviteError).code
      }
    }
    expect(codes(url.slice(0, -10))).toBe('MALFORMED')
    expect(codes(url + 'AAAA')).toBe('MALFORMED')
    expect(codes(url.replace('#', '#!'))).toBe('MALFORMED')
    expect(codes(url + '.bad hint')).toBe('MALFORMED')
    expect(codes(url.slice(0, url.indexOf('#')))).toBe('MALFORMED')
    expect(codes('https://relay.example/other/' + IDS.session + '#abc')).toBe('MALFORMED')
    const zero = new Uint8Array(165)
    zero[0] = 1
    expect(() => parseInviteFragment(toBase64Url(zero))).toThrow(/not complete/)
    // An epoch above MAX_EPOCH (u16 allows 65535) is refused with an InviteError, not a crash.
    const tooHigh = new Uint8Array(165)
    tooHigh[0] = 1
    tooHigh[1] = 0x27
    tooHigh[2] = 0x10 // 10000
    tooHigh[3 + 32] = 4
    tooHigh[3 + 32 + 65] = 4
    expect(codes('https://relay.example/s/' + IDS.session + '#' + toBase64Url(tooHigh))).toBe(
      'MALFORMED',
    )
  })

  it('refuses to build a link from bad inputs', async () => {
    const ctl = await makeController(crypto)
    const good = {
      base: 'x',
      sessionId: IDS.session,
      epoch: 1,
      key: { kind: 'players' as const, root: ctl.keys.root('players')! },
      controllerPub: ctl.controllerPub,
      controllerEcdhPub: ctl.keys.controllerEcdhPub!,
    }
    expect(() => buildInvite({ ...good, epoch: 0 })).toThrow(/epoch/)
    expect(() => buildInvite({ ...good, controllerEcdhPub: new Uint8Array(65) })).toThrow(/ECDH/)
    expect(() =>
      buildInvite({ ...good, key: { kind: 'players', root: new Uint8Array(31) } }),
    ).toThrow(/32 bytes/)
    expect(() => buildInvite({ ...good, controllerPub: new Uint8Array(65) })).toThrow(
      /uncompressed/,
    )
    expect(() => buildInvite({ ...good, roleHint: 'has space' })).toThrow(/role hint/)
    expect(() => buildInvite({ ...good, sessionId: 'short' })).toThrow(/session id/)
  })
})
