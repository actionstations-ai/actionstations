// Bank routing numbers in released content must be fictional (#331): every ABA routing number
// in a template's preview.json or schema.json examples, and in the example projects, fails the
// ABA checksum (3·d1 + 7·d2 + d3 + 3·d4 + 7·d5 + d6 + 3·d7 + 7·d8 + d9 ≡ 0 mod 10 for a real
// one), so it can never point at a real institution.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SCANNED = ['templates/injects', 'examples', 'tests/fixtures/injects']

/** True when a nine-digit number passes the ABA routing number checksum. */
function passesAbaChecksum(n: string): boolean {
  if (!/^\d{9}$/.test(n)) return false
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1]
  return [...n].reduce((sum, d, i) => sum + Number(d) * w[i]!, 0) % 10 === 0
}

function jsonFiles(dir: string): string[] {
  const abs = join(ROOT, dir)
  let names: string[]
  try {
    names = readdirSync(abs)
  } catch {
    return []
  }
  return names.flatMap((name) => {
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory())
      return name === '__golden__' || name === 'node_modules' ? [] : jsonFiles(rel)
    return name.endsWith('.json') ? [rel] : []
  })
}

const ROUTING_KEY = /aba|routing|rtn/i
const ROUTING_TEXT = /\b(?:ABA|RTN|routing(?: number| no\.?)?)\D{0,12}(\d{9})\b/gi

/** Routing numbers found in a JSON value: under a routing-ish key, or named in text. */
function routingNumbers(value: unknown, keyPath: string[] = []): string[] {
  if (typeof value === 'string') {
    const out = [...value.matchAll(ROUTING_TEXT)].map((m) => m[1]!)
    if (keyPath.some((k) => ROUTING_KEY.test(k)) && /^\d{9}$/.test(value)) out.push(value)
    return out
  }
  if (Array.isArray(value)) return value.flatMap((v) => routingNumbers(v, keyPath))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => routingNumbers(v, [...keyPath, k]))
  return []
}

describe('fictional bank routing numbers', () => {
  it('knows a valid checksum from an invalid one', () => {
    expect(passesAbaChecksum('011000015')).toBe(true) // the Federal Reserve's own example
    expect(passesAbaChecksum('071925508')).toBe(false)
    expect(passesAbaChecksum('12345678')).toBe(false)
  })

  it('every routing number in released content fails the ABA checksum', () => {
    const found: string[] = []
    const real: string[] = []
    for (const dir of SCANNED)
      for (const file of jsonFiles(dir)) {
        for (const n of routingNumbers(JSON.parse(readFileSync(join(ROOT, file), 'utf8')))) {
          found.push(n)
          if (passesAbaChecksum(n)) real.push(`${relative(ROOT, join(ROOT, file))}: ${n}`)
        }
      }
    expect(found.length, 'the wire transfer preview has routing numbers').toBeGreaterThan(0)
    expect(real).toEqual([])
  })
})
