/**
 * Address allow-list (spec 0409 FR-5 `allow`): IPv4 and IPv6 networks in CIDR notation, matched
 * on the TCP connection before TLS. Node reports IPv4 peers of a dual-stack listener as
 * `::ffff:a.b.c.d`; those are matched as IPv4.
 */
import { isIP } from 'node:net'

export interface Cidr {
  family: 4 | 6
  /** Network address as a big integer. */
  network: bigint
  bits: number
}

const MAPPED_V4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i

export function ipToBigInt(address: string): { family: 4 | 6; value: bigint } | undefined {
  const mapped = MAPPED_V4.exec(address)
  if (mapped) return ipToBigInt(mapped[1]!)
  const family = isIP(address)
  if (family === 4) {
    const parts = address.split('.').map(Number)
    return { family: 4, value: parts.reduce((acc, p) => (acc << 8n) + BigInt(p), 0n) }
  }
  if (family === 6) return { family: 6, value: v6ToBigInt(address) }
  return undefined
}

function v6ToBigInt(address: string): bigint {
  let text = address
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  // An embedded IPv4 tail ("::ffff:1.2.3.4" handled above; "::1.2.3.4" here).
  const lastColon = text.lastIndexOf(':')
  const tail = text.slice(lastColon + 1)
  if (tail.includes('.')) {
    const v4 = ipToBigInt(tail)!.value
    text = `${text.slice(0, lastColon)}:${(v4 >> 16n).toString(16)}:${(v4 & 0xffffn).toString(16)}`
  }
  const [head, rest] = text.split('::')
  const headParts = head ? head.split(':') : []
  const restParts = rest ? rest.split(':') : []
  const missing = 8 - headParts.length - restParts.length
  const groups = [
    ...headParts,
    ...Array<string>(rest === undefined ? 0 : missing).fill('0'),
    ...restParts,
  ]
  return groups.reduce((acc, g) => (acc << 16n) + BigInt(parseInt(g || '0', 16)), 0n)
}

/** `10.0.0.0/8`, `fd00::/8`, or a bare address (a /32 or /128). */
export function parseCidr(text: string): Cidr | undefined {
  const [addr, bitsText, extra] = text.trim().split('/')
  if (!addr || extra !== undefined) return undefined
  const ip = ipToBigInt(addr)
  if (!ip) return undefined
  const max = ip.family === 4 ? 32 : 128
  const bits = bitsText === undefined ? max : Number(bitsText)
  if (
    !Number.isInteger(bits) ||
    bits < 0 ||
    bits > max ||
    (bitsText !== undefined && !/^\d+$/.test(bitsText))
  ) {
    return undefined
  }
  const mask = bits === 0 ? 0n : ((1n << BigInt(bits)) - 1n) << BigInt(max - bits)
  return { family: ip.family, network: ip.value & mask, bits }
}

export class AllowList {
  private readonly rules: Cidr[]

  constructor(cidrs: readonly string[]) {
    this.rules = cidrs.map((c) => {
      const parsed = parseCidr(c)
      if (!parsed) throw new Error(`Not an address or CIDR: ${c}`)
      return parsed
    })
  }

  /** An empty list allows everyone. */
  get open(): boolean {
    return this.rules.length === 0
  }

  allows(address: string | undefined): boolean {
    if (this.open) return true
    if (!address) return false
    const ip = ipToBigInt(address)
    if (!ip) return false
    const max = ip.family === 4 ? 32 : 128
    return this.rules.some((rule) => {
      if (rule.family !== ip.family) return false
      const mask =
        rule.bits === 0 ? 0n : ((1n << BigInt(rule.bits)) - 1n) << BigInt(max - rule.bits)
      return (ip.value & mask) === rule.network
    })
  }
}
