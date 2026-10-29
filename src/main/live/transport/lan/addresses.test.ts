import { describe, expect, it } from 'vitest'
import {
  chooseAddress,
  classifyInterface,
  isPrivateIpv4,
  rankAddresses,
  type Interfaces,
} from './addresses'

const v4 = (address: string, internal = false) => ({ address, family: 'IPv4', internal })
const v6 = (address: string) => ({ address, family: 'IPv6', internal: false })

const MACOS: Interfaces = {
  lo0: [v4('127.0.0.1', true), v6('::1')],
  en0: [v4('192.168.4.20'), v6('fe80::1')],
  en5: [v4('10.0.0.8')],
  utun3: [v4('100.100.7.9')],
  awdl0: [v6('fe80::2')],
}

const WINDOWS: Interfaces = {
  'Wi-Fi': [v4('192.168.1.42')],
  Ethernet: [v4('172.16.5.3')],
  'vEthernet (WSL)': [v4('172.29.0.1')],
  'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
}

const LINUX: Interfaces = {
  lo: [v4('127.0.0.1', true)],
  wlp3s0: [v4('192.168.0.11')],
  docker0: [v4('172.17.0.1')],
  'br-9f2a': [v4('172.18.0.1')],
  tailscale0: [v4('100.101.1.2')],
}

describe('listLanAddresses ranking (spec 0407 FR-2)', () => {
  it('recommends the Wi-Fi address on macOS and lists the VPN last', () => {
    const out = rankAddresses(MACOS)
    expect(out.map((a) => a.address)).toEqual(['192.168.4.20', '10.0.0.8', '100.100.7.9'])
    expect(out[0]).toMatchObject({ interface: 'en0', kind: 'wifi', recommended: true })
    expect(out[2]).toMatchObject({ kind: 'virtual', recommended: false })
  })

  it('recommends Wi-Fi on Windows and never a Hyper-V adapter', () => {
    const out = rankAddresses(WINDOWS)
    expect(out[0]).toMatchObject({ address: '192.168.1.42', kind: 'wifi', recommended: true })
    expect(out.find((a) => a.interface.startsWith('vEthernet'))).toMatchObject({
      kind: 'virtual',
      recommended: false,
    })
  })

  it('leaves Docker bridges and Tailscale unrecommended on Linux', () => {
    const out = rankAddresses(LINUX)
    expect(out[0]).toMatchObject({ address: '192.168.0.11', recommended: true })
    expect(out.filter((a) => a.recommended)).toHaveLength(1)
    expect(out.slice(1).every((a) => a.kind === 'virtual')).toBe(true)
  })

  it('ranks a link-local address last and recommends nothing when that is all there is', () => {
    const out = rankAddresses({ en0: [v4('169.254.10.4')], lo0: [v4('127.0.0.1', true)] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ linkLocal: true, recommended: false })
    expect(rankAddresses({ lo0: [v4('127.0.0.1', true)] })).toEqual([])
  })

  it('prefers a private address over a public one on an Ethernet-only machine', () => {
    const out = rankAddresses({ eth0: [v4('203.0.113.5')], eth1: [v4('10.1.2.3')] })
    expect(out[0]).toMatchObject({ address: '10.1.2.3', recommended: true })
    expect(out[1]).toMatchObject({ address: '203.0.113.5', private: false })
  })

  it("chooses the requested address only when it is one of the computer's", () => {
    const out = rankAddresses(MACOS)
    expect(chooseAddress(out, '10.0.0.8')?.interface).toBe('en5')
    expect(chooseAddress(out, '192.168.99.99')).toBeUndefined()
    expect(chooseAddress(out)?.address).toBe('192.168.4.20')
  })

  it('classifies interface names and private ranges', () => {
    expect(classifyInterface('wlan0')).toBe('wifi')
    expect(classifyInterface('enp0s31f6')).toBe('ethernet')
    expect(classifyInterface('ZeroTier One [abc]')).toBe('virtual')
    expect(classifyInterface('bond0')).toBe('other')
    expect(isPrivateIpv4('172.31.255.1')).toBe(true)
    expect(isPrivateIpv4('172.32.0.1')).toBe(false)
    expect(isPrivateIpv4('100.64.0.1')).toBe(true)
    expect(isPrivateIpv4('8.8.8.8')).toBe(false)
  })
})
