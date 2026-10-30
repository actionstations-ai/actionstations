import { describe, expect, it } from 'vitest'
import { toBase64Url } from './bytes'
import { buildInvite } from './invite'
import {
  decodePartnerInvite,
  encodePartnerInvite,
  PARTNER_INVITE_PREFIX,
  PartnerInviteError,
  type PartnerInvite,
} from './partner-invite'

const point = (fill: number) => new Uint8Array(65).fill(fill, 1).fill(4, 0, 1)
const link = (kind: 'players' | 'staff', base = 'https://relay.example') =>
  buildInvite({
    base,
    sessionId: toBase64Url(new Uint8Array(16).fill(3)),
    epoch: 1,
    key: { kind, root: new Uint8Array(32).fill(9) },
    controllerPub: point(1),
    controllerEcdhPub: point(2),
  })

const invite = (over: Partial<PartnerInvite> = {}): PartnerInvite => ({
  v: 1,
  org: 'air',
  name: 'Airport Authority',
  connection: { kind: 'relay' },
  link: link('staff'),
  controllerToken: 'T'.repeat(32),
  ...over,
})

const raw = (value: unknown) =>
  PARTNER_INVITE_PREFIX + toBase64Url(new TextEncoder().encode(JSON.stringify(value)))

describe('partner invite', () => {
  it('round-trips an invite', () => {
    expect(decodePartnerInvite(encodePartnerInvite(invite()))).toEqual(invite())
  })

  it('refuses a players link: a partner needs the staff key to read staff material', () => {
    expect(() => encodePartnerInvite(invite({ link: link('players') }))).toThrow(PartnerInviteError)
    expect(() => decodePartnerInvite(raw(invite({ link: link('players') })))).toThrow(/staff key/)
  })

  it('refuses a self-hosted invite whose link points at another server', () => {
    const other = invite({
      connection: { kind: 'self-hosted', url: 'https://ttx.example.org', insecureHttp: false },
      link: link('staff', 'https://evil.example'),
    })
    expect(() => decodePartnerInvite(raw(other))).toThrow(/two different servers/)
  })

  it.each([
    ['text without the prefix', 'hello'],
    ['damaged base64', `${PARTNER_INVITE_PREFIX}!!!`],
    ['an extra field', raw({ ...invite(), extra: 1 })],
    ['a short token', raw(invite({ controllerToken: 'short' }))],
    ['an oversize invite', PARTNER_INVITE_PREFIX + 'A'.repeat(9000)],
  ])('refuses %s', (_name, text) => {
    expect(() => decodePartnerInvite(text)).toThrow(PartnerInviteError)
  })
})
