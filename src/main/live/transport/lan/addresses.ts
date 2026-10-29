/**
 * The computer's IPv4 addresses for the join QR code (spec 0407 FR-2): ranked so the likely
 * Wi-Fi address comes first, virtual adapters (VPNs, containers) last and never recommended.
 * IPv6 is not offered in v1 (QR length, bracket URLs, phones on IPv4-only guest networks).
 */
import { networkInterfaces } from 'node:os'
import type { LanAddress, LanAddressKind } from '@shared/schemas/live'

export interface InterfaceInfo {
  address: string
  family: string | number
  internal: boolean
}
export type Interfaces = Record<string, InterfaceInfo[] | undefined>

const VIRTUAL =
  /^(utun|tun|tap|ipsec|ppp|awdl|llw|bridge|vmnet|vboxnet|docker|br-|veth|virbr|vEthernet|tailscale|ZeroTier|zt|wg|lo|Loopback|Hyper-V|VMware|VirtualBox|Bluetooth|Teredo)/i
const WIFI = /^(wlan|wlp|wlx|wifi|wi-fi|wireless|en0$|ath|airport)/i
const ETHERNET = /^(eth|enp|ens|eno|em|en\d|ethernet|local area connection)/i

export function classifyInterface(name: string): LanAddressKind {
  if (VIRTUAL.test(name)) return 'virtual'
  if (WIFI.test(name)) return 'wifi'
  if (ETHERNET.test(name)) return 'ethernet'
  return 'other'
}

/** RFC 1918 or the carrier-grade range 100.64/10 (some guest networks hand these out). */
export function isPrivateIpv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number)
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true
  return a === 100 && b !== undefined && b >= 64 && b <= 127
}

export const isLinkLocal = (address: string): boolean => address.startsWith('169.254.')

const KIND_RANK: Record<LanAddressKind, number> = { wifi: 0, ethernet: 1, other: 2, virtual: 3 }

function isIpv4(info: InterfaceInfo): boolean {
  return info.family === 'IPv4' || info.family === 4
}

/** Candidates ranked: private before public, Wi-Fi before Ethernet, virtual last, link-local last of all. */
export function rankAddresses(interfaces: Interfaces): LanAddress[] {
  const out: LanAddress[] = []
  for (const [name, infos] of Object.entries(interfaces)) {
    for (const info of infos ?? []) {
      if (!isIpv4(info) || info.internal || info.address.startsWith('127.')) continue
      out.push({
        address: info.address,
        interface: name,
        kind: classifyInterface(name),
        private: isPrivateIpv4(info.address),
        linkLocal: isLinkLocal(info.address),
        recommended: false,
      })
    }
  }
  out.sort(
    (x, y) =>
      Number(x.linkLocal) - Number(y.linkLocal) ||
      Number(y.private) - Number(x.private) ||
      KIND_RANK[x.kind] - KIND_RANK[y.kind] ||
      x.interface.localeCompare(y.interface),
  )
  const best = out.find((a) => a.private && !a.linkLocal && a.kind !== 'virtual')
  if (best) best.recommended = true
  return out
}

export function listLanAddresses(read: () => Interfaces = readInterfaces): LanAddress[] {
  return rankAddresses(read())
}

function readInterfaces(): Interfaces {
  return networkInterfaces() as Interfaces
}

/** Which address to bind for a session: the request's, else the recommended, else the first. */
export function chooseAddress(addresses: LanAddress[], requested?: string): LanAddress | undefined {
  if (requested) return addresses.find((a) => a.address === requested)
  return addresses.find((a) => a.recommended) ?? addresses[0]
}
