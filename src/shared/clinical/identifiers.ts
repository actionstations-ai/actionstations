// Direct identifiers in imported case text (spec 0452 NFR-2): a hospital educator who turns a real
// event into a case study must not carry a patient's identifiers into a shared pack or to a
// provider. `scanIdentifiers` finds the patterns that are almost always identifiers; `redact`
// replaces them. It is a safety net, not a de-identification guarantee: names and free-text
// details still need the author's own review. Pure.

export interface IdentifierHit {
  kind:
    'ssn' | 'phone' | 'email' | 'date_of_birth' | 'record_number' | 'street_address' | 'zip' | 'url'
  text: string
  index: number
}

const PATTERNS: [IdentifierHit['kind'], RegExp][] = [
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
  ['phone', /(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)/g],
  ['date_of_birth', /\b(?:DOB|date of birth|born)\b[:\s]*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi],
  [
    'record_number',
    /\b(?:MRN|medical record(?: number)?|account(?: number)?)[#:\s]*(?!SIM-)[A-Z0-9-]{5,}\b/gi,
  ],
  [
    'street_address',
    /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct)\b\.?/g,
  ],
  ['zip', /(?<!\d)\d{5}-\d{4}(?!\d)/g],
  ['url', /\bhttps?:\/\/\S+/g],
]

export function scanIdentifiers(text: string): IdentifierHit[] {
  const hits: IdentifierHit[] = []
  for (const [kind, re] of PATTERNS)
    for (const m of text.matchAll(re)) hits.push({ kind, text: m[0], index: m.index ?? 0 })
  return hits.sort((a, b) => a.index - b.index)
}

const PLACEHOLDER: Record<IdentifierHit['kind'], string> = {
  ssn: '[removed number]',
  phone: '[removed phone]',
  email: '[removed email]',
  date_of_birth: '[removed date of birth]',
  record_number: '[removed record number]',
  street_address: '[removed address]',
  zip: '[removed ZIP]',
  url: '[removed link]',
}

export function redact(text: string): string {
  let out = text
  for (const [kind, re] of PATTERNS) out = out.replace(re, PLACEHOLDER[kind])
  return out
}

/** Every string inside a value, with its path, so a whole case can be scanned. */
export function stringsIn(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }]
  if (Array.isArray(value)) return value.flatMap((v, i) => stringsIn(v, `${path}[${i}]`))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([k, v]) => stringsIn(v, path ? `${path}.${k}` : k))
  return []
}

/** Redact every string of a JSON-like value, returning a copy. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redact(value) as T
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as T
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactDeep(v)])) as T
  return value
}
