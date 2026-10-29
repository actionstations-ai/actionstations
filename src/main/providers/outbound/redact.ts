// Keyed, deterministic placeholders (FR-11, FR-14). Each detected value becomes
// [[CATEGORY_XXXX]], XXXX = four base32 characters of HMAC-SHA256(project key, category + value).
// The same value gets the same placeholder in every request of the project, so the model sees a
// consistent cast and prompt caching keeps working. The registry (placeholder → value) lives in
// main-process memory for the app session only: never written, logged or sent.
import { createHmac } from 'node:crypto'
import type { RedactionCategory } from '@shared/schemas'
import { detectAll, normalizePhone, type DetectContext, type DetectedSpan } from './detect'
import { escapeRegExp } from './detect/types'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const MIN_CODE = 4

function base32(bytes: Buffer): string {
  let out = ''
  let bits = 0
  let value = 0
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out
}

export interface PlaceholderEntry {
  category: RedactionCategory
  /** The value as first seen; replies are restored to this spelling. */
  value: string
}

/** One project's issued placeholders, for this app session. */
export class RedactionRegistry {
  private readonly byKey = new Map<string, string>()
  private readonly byPlaceholder = new Map<string, PlaceholderEntry>()

  constructor(private readonly key: Buffer) {}

  /** "PERSON_7F3K" → entry (case-insensitive). */
  lookup(token: string): PlaceholderEntry | undefined {
    return this.byPlaceholder.get(token.toUpperCase())
  }

  get size(): number {
    return this.byPlaceholder.size
  }

  /** A keyed fingerprint (send log): unlinkable across projects, unguessable without the key. */
  mac(text: string): string {
    return createHmac('sha256', this.key).update(`fingerprint\u0000${text}`).digest('hex')
  }

  private known?: { size: number; literal?: RegExp; phone?: RegExp }
  private categoryOf = new Map<string, RedactionCategory>()

  private patterns(): { literal?: RegExp; phone?: RegExp } {
    if (this.known?.size === this.size) return this.known
    const literals: string[] = []
    const phones: string[] = []
    this.categoryOf.clear()
    for (const { category, value } of this.byPlaceholder.values()) {
      if (category === 'phone') {
        const d = normalizePhone(value)
        if (d.length >= 7) phones.push(d)
        continue
      }
      const norm = normalizeValue(category, value)
      if (norm.length < 2 || this.categoryOf.has(norm)) continue
      this.categoryOf.set(norm, category)
      literals.push(norm)
    }
    const alt = (items: string[], body: (s: string) => string) =>
      [...new Set(items)]
        .sort((a, b) => b.length - a.length || a.localeCompare(b))
        .map(body)
        .join('|')
    const B = '(?<![\\p{L}\\p{N}_])'
    const A = '(?![\\p{L}\\p{N}_])'
    this.known = {
      size: this.size,
      ...(literals.length
        ? {
            literal: new RegExp(
              `${B}(?:${alt(literals, (v) => escapeRegExp(v).replace(/ /g, '\\s+'))})${A}`,
              'giu',
            ),
          }
        : {}),
      ...(phones.length
        ? {
            phone: new RegExp(
              `(?<![\\w.\\-/+:])(?:\\+?1[\\s.-]?)?(?:${alt(phones, (d) =>
                [...d].join('[\\s().-]{0,2}'),
              )})(?![\\w]|[.\\-/:]\\d)`,
              'g',
            ),
          }
        : {}),
    }
    return this.known
  }

  /**
   * Every value this project has already redacted, wherever it appears again (a reply restored
   * on this computer and sent back in a repair round or a later stage). Longest first.
   */
  knownSpans(text: string): DetectedSpan[] {
    if (this.size === 0) return []
    const { literal, phone } = this.patterns()
    const out: DetectedSpan[] = []
    for (const m of literal ? text.matchAll(literal) : []) {
      const category = this.categoryOf.get(normalizeValue('person', m[0]))
      if (category) out.push({ start: m.index, end: m.index + m[0].length, category, value: m[0] })
    }
    for (const m of phone ? text.matchAll(phone) : [])
      out.push({ start: m.index, end: m.index + m[0].length, category: 'phone', value: m[0] })
    return out
  }

  private code(category: RedactionCategory, norm: string): string {
    const mac = createHmac('sha256', this.key).update(`${category}\u0000${norm}`).digest()
    return base32(mac)
  }

  /** The token (without brackets) for a value, issuing one if new. */
  issue(category: RedactionCategory, value: string): string {
    const norm = normalizeValue(category, value)
    const k = `${category}\u0000${norm}`
    const known = this.byKey.get(k)
    if (known) return known
    const code = this.code(category, norm)
    for (let n = MIN_CODE; n <= code.length; n++) {
      const token = `${category.toUpperCase()}_${code.slice(0, n)}`
      if (!this.byPlaceholder.has(token)) {
        this.byKey.set(k, token)
        this.byPlaceholder.set(token, { category, value })
        return token
      }
    }
    throw new Error('placeholder space exhausted')
  }
}

export const bracket = (token: string): string => `[[${token}]]`

/** Values compare case- and spacing-insensitively; phones by digits. */
export function normalizeValue(category: RedactionCategory, value: string): string {
  if (category === 'phone') return normalizePhone(value)
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface PlacedSpan {
  /** Offsets in the redacted text. */
  start: number
  end: number
  category: RedactionCategory
  placeholder: string
  original: string
}

export interface Redacted {
  text: string
  spans: PlacedSpan[]
}

/**
 * Replace detected values with placeholders. New values in one call are issued in sorted order,
 * so a collision always extends the same one (FR-11).
 */
export function redactText(
  text: string,
  enabled: ReadonlySet<RedactionCategory>,
  ctx: DetectContext,
  registry: RedactionRegistry,
): Redacted {
  // Values already redacted in this project come first: a reply restored on this computer and
  // sent back (a repair round, a later stage) must not carry them in the clear (#454 review).
  const known = registry.knownSpans(text).filter((s) => enabled.has(s.category))
  const found = detectAll(text, enabled, ctx, known)
  if (found.length === 0) return { text, spans: [] }
  const order = [...found].sort((a, b) =>
    `${a.category}\u0000${normalizeValue(a.category, a.value)}`.localeCompare(
      `${b.category}\u0000${normalizeValue(b.category, b.value)}`,
    ),
  )
  for (const s of order) registry.issue(s.category, s.value)
  let out = ''
  let at = 0
  const spans: PlacedSpan[] = []
  for (const s of found) {
    out += text.slice(at, s.start)
    const placeholder = bracket(registry.issue(s.category, s.value))
    spans.push({
      start: out.length,
      end: out.length + placeholder.length,
      category: s.category,
      placeholder,
      original: s.value,
    })
    out += placeholder
    at = s.end
  }
  return { text: out + text.slice(at), spans }
}
