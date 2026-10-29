import { describe, expect, it } from 'vitest'
import { AllowList, parseCidr } from '../src/allowlist'

describe('allow-list', () => {
  it('parses IPv4 and IPv6 networks and bare addresses, and refuses the rest', () => {
    expect(parseCidr('10.0.0.0/8')).toEqual({ family: 4, network: 10n << 24n, bits: 8 })
    expect(parseCidr('192.168.1.7')).toMatchObject({ family: 4, bits: 32 })
    expect(parseCidr('fd00::/8')).toMatchObject({ family: 6, bits: 8 })
    expect(parseCidr('::1')).toMatchObject({ family: 6, bits: 128 })
    for (const bad of [
      '10.0.0.0/33',
      '10.0.0/8',
      'fd00::/129',
      'hello',
      '10.0.0.0/8/1',
      '10.0.0.0/x',
      '',
    ]) {
      expect(parseCidr(bad), bad).toBeUndefined()
    }
  })

  it('matches addresses, including IPv4 peers reported as ::ffff:a.b.c.d', () => {
    const list = new AllowList(['10.0.0.0/8', '192.168.4.0/24', 'fd12:3456::/32', '2001:db8::1'])
    expect(list.open).toBe(false)
    expect(list.allows('10.200.1.2')).toBe(true)
    expect(list.allows('::ffff:10.200.1.2')).toBe(true)
    expect(list.allows('192.168.4.250')).toBe(true)
    expect(list.allows('192.168.5.1')).toBe(false)
    expect(list.allows('11.0.0.1')).toBe(false)
    expect(list.allows('fd12:3456:aaaa::7')).toBe(true)
    expect(list.allows('fd12:3457::7')).toBe(false)
    expect(list.allows('2001:db8::1')).toBe(true)
    expect(list.allows('2001:db8::2')).toBe(false)
    expect(list.allows('fe80::1%en0')).toBe(false)
    expect(list.allows(undefined)).toBe(false)
    expect(list.allows('not-an-address')).toBe(false)
  })

  it('an empty list allows everyone and a bad entry is refused at construction', () => {
    expect(new AllowList([]).open).toBe(true)
    expect(new AllowList([]).allows('8.8.8.8')).toBe(true)
    expect(() => new AllowList(['nope'])).toThrow(/Not an address/)
  })
})
