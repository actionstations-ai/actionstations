// Facility facts (#84): the identifiers the project's documents actually state — runways,
// taxiways, gates, concourses, rooms/levels, hostnames, IP ranges, phone numbers, agencies —
// extracted deterministically from documents/<id>/text.md. Prompts receive them as the only
// allowed identifiers (small models follow a short list better than a retrieved chunk), and
// lintFacilityIds flags identifiers in generated text that neither the facts nor the row's own
// "fake data" framing cover.
import { promises as fs } from 'node:fs'
import type { LintWarning, MselRow, Project, Scenario } from '@shared/schemas'
import { documentFiles } from '../ingest/storage'

export const FACILITY_UNKNOWN_ID = 'FACILITY_UNKNOWN_ID'

export interface FacilityFacts {
  /** Runway pairs as written ("5/23") plus each end ("5", "23"). */
  runways: string[]
  /** Taxiway letters ("A"). */
  taxiways: string[]
  /** Gate ids with ranges expanded ("A1" … "A8"). */
  gates: string[]
  concourses: string[]
  /** "Room 104", "Level 2", "Lot C" — noun + id as written. */
  rooms: string[]
  hosts: string[]
  ips: string[]
  /** First three octets of every documented address ("10.66.0"). */
  ipPrefixes: string[]
  phones: string[]
  agencies: string[]
  documentCount: number
}

export const EMPTY_FACTS: FacilityFacts = {
  runways: [],
  taxiways: [],
  gates: [],
  concourses: [],
  rooms: [],
  hosts: [],
  ips: [],
  ipPrefixes: [],
  phones: [],
  agencies: [],
  documentCount: 0,
}

/** A list of ids after a noun: "A1–A8, B1–B10", "A and B", "5/23 and 1/19". */
const ID_LIST = String.raw`([A-Z]?\d{1,3}[A-Z]?|[A-Z])\b(?:\s*(?:[–-]|,|and|&|\/)\s*(?:[A-Z]?\d{1,3}[A-Z]?|[A-Z])\b)*`
const RUNWAY = /\bRunways?\s+(\d{1,2}[LRC]?)(?:\s*\/\s*(\d{1,2}[LRC]?))?/gi
/** "Runways 5/23 and 1/19", "Runway 23": the whole list after the noun. */
const RUNWAY_LIST =
  /\bRunways?\s+(\d{1,2}[LRC]?(?:\s*\/\s*\d{1,2}[LRC]?)?(?:\s*(?:,|and|&)\s*\d{1,2}[LRC]?(?:\s*\/\s*\d{1,2}[LRC]?)?)*)/gi
const TAXIWAY = new RegExp(String.raw`\bTaxiways?\s+${ID_LIST}`, 'gi')
const GATE = new RegExp(String.raw`\bGates?\s*[:(]?\s*${ID_LIST}`, 'gi')
const CONCOURSE = new RegExp(String.raw`\bConcourses?\s+${ID_LIST}`, 'gi')
const ROOM = /\b(Room|Level|Door|Lot|Stairwell|Checkpoint|Shelter)\s+([A-Z]?\d{1,4}[A-Z]?|[A-Z])\b/g
const HOST =
  /\b[A-Z][A-Z0-9]{1,}(?:[_-][A-Z0-9]{1,}){1,}\b|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:local|corp|lan|internal|net|com|org|gov)\b/g
const IP = /\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3}|x)\b/gi
const PHONE = /\(?\b(\d{3})\)?[ -](\d{3})-(\d{4})\b/g
const AGENCY =
  /\b(?:FBI|TSA|FAA|CISA|NTSB|DHS|FEMA|CBP|ATF|DEA|NSA|EPA|OSHA|Coast Guard|National Guard|State Patrol|Highway Patrol)\b|\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s(?:Police|Fire|Sheriff'?s?|Emergency Management|Health|Public Health)\s(?:Department|Office|Agency|District)\b/g

/** The text itself says the identifier is bogus (attacker data, a data-integrity tell). */
const FAKE_FRAMING =
  /\b(?:no such|does not exist|doesn't exist|non-?existent|not a real|not exist|invalid|fake|bogus|impossible|phantom|fictitious|made-up|spoofed)\b/i

/** Hyphenated words that look like hosts but are document vocabulary (HSPD-5, AES-256). */
const isHostLike = (token: string): boolean => {
  if (token.includes('.')) return true
  const parts = token.split(/[_-]/)
  if (parts.length >= 3) return true
  const [head, tail] = parts as [string, string]
  return /[A-Z]{2,}/.test(head) && (/^\d{2}$/.test(tail) || (/\d/.test(tail) && /[A-Z]/.test(tail)))
}

/** "A1–A8" → A1 … A8; "5/23" → both; other items pass through (ids uppercased). */
function expandIds(list: string): string[] {
  const out: string[] = []
  for (const item of list.toUpperCase().split(/\s*(?:,|AND|&|\/)\s*/)) {
    const range = /^([A-Z]?)(\d{1,3})\s*[–-]\s*([A-Z]?)(\d{1,3})$/.exec(item.trim())
    if (range && (range[1] === range[3] || !range[3])) {
      const from = Number(range[2])
      const to = Number(range[4])
      if (to >= from && to - from <= 60) {
        for (let n = from; n <= to; n++) out.push(`${range[1]}${n}`)
        continue
      }
    }
    const letters = /^([A-Z])\s*[–-]\s*([A-Z])$/.exec(item.trim())
    if (letters) {
      for (let c = letters[1]!.charCodeAt(0); c <= letters[2]!.charCodeAt(0); c++)
        out.push(String.fromCharCode(c))
      continue
    }
    const one = item.trim()
    if (one) out.push(one)
  }
  return out
}

const add = (into: Set<string>, values: Iterable<string>): void => {
  for (const v of values) if (v) into.add(v)
}

/** Extract the facility facts from document texts (pure). */
export function extractFacilityFacts(texts: string[]): FacilityFacts {
  const runways = new Set<string>()
  const taxiways = new Set<string>()
  const gates = new Set<string>()
  const concourses = new Set<string>()
  const rooms = new Set<string>()
  const hosts = new Set<string>()
  const ips = new Set<string>()
  const prefixes = new Set<string>()
  const phones = new Set<string>()
  const agencies = new Set<string>()
  for (const text of texts) {
    // Facility identifiers come only from sentences that do not call them fake (a plan may
    // note that "Gate Z99 does not exist"); hosts, addresses and phones are taken from all.
    const real = text
      .split(/(?<=[.!?])\s+|\n/)
      .filter((sentence) => !FAKE_FRAMING.test(sentence))
      .join('\n')
    for (const m of real.matchAll(RUNWAY_LIST)) {
      for (const item of m[1]!.toUpperCase().split(/\s*(?:,|AND|&)\s*/)) {
        const [a, b] = item.split(/\s*\/\s*/)
        add(runways, [a!, ...(b ? [b, `${a}/${b}`] : [])])
      }
    }
    for (const m of real.matchAll(TAXIWAY))
      add(taxiways, expandIds(m[0].replace(/^Taxiways?\s+/i, '')))
    for (const m of real.matchAll(GATE))
      add(gates, expandIds(m[0].replace(/^Gates?\s*[:(]?\s*/i, '')))
    for (const m of real.matchAll(CONCOURSE))
      add(concourses, expandIds(m[0].replace(/^Concourses?\s+/i, '')))
    for (const m of real.matchAll(ROOM)) rooms.add(`${m[1]} ${m[2]}`)
    for (const m of text.matchAll(HOST)) if (isHostLike(m[0])) hosts.add(m[0])
    for (const m of text.matchAll(IP)) {
      prefixes.add(m[1]!)
      if (m[2] !== 'x') ips.add(`${m[1]}.${m[2]}`)
    }
    for (const m of text.matchAll(PHONE)) phones.add(`(${m[1]}) ${m[2]}-${m[3]}`)
    for (const m of text.matchAll(AGENCY)) agencies.add(m[0])
  }
  return {
    runways: [...runways],
    taxiways: [...taxiways].sort(),
    gates: [...gates],
    concourses: [...concourses].sort(),
    rooms: [...rooms],
    hosts: [...hosts],
    ips: [...ips],
    ipPrefixes: [...prefixes],
    phones: [...phones],
    agencies: [...agencies],
    documentCount: texts.length,
  }
}

/** Read every ingested document's text.md and extract the facts. */
export async function loadFacilityFacts(root: string, project: Project): Promise<FacilityFacts> {
  const texts: string[] = []
  for (const doc of project.documents) {
    if (doc.status !== 'ok') continue
    try {
      texts.push(await fs.readFile(documentFiles(root, doc).text, 'utf8'))
    } catch {
      // A document without text.md (ingest interrupted) contributes nothing.
    }
  }
  return extractFacilityFacts(texts)
}

/** Small models read "B17" into "B1–B10"; a short list is spelled out, a long one ranged. */
const ENUMERATE_UP_TO = 40

/** Gate ids for the model: every id when the list is short, else "A1–A8, B1–B10, 24". */
export function gateList(ids: string[]): string {
  return ids.length <= ENUMERATE_UP_TO ? ids.join(', ') : compressIds(ids)
}

/** "A1, A2, …, A8, B1 … B10, 24" → "A1–A8, B1–B10, 24". */
export function compressIds(ids: string[]): string {
  const groups = new Map<string, number[]>()
  const loose: string[] = []
  for (const id of ids) {
    const m = /^([A-Z]?)(\d{1,3})$/.exec(id)
    if (!m) loose.push(id)
    else groups.set(m[1]!, [...(groups.get(m[1]!) ?? []), Number(m[2])])
  }
  const parts: string[] = []
  for (const [prefix, nums] of groups) {
    const sorted = [...new Set(nums)].sort((a, b) => a - b)
    let start = sorted[0]!
    let prev = start
    const flush = (): void => {
      parts.push(start === prev ? `${prefix}${start}` : `${prefix}${start}–${prefix}${prev}`)
    }
    for (const n of sorted.slice(1)) {
      if (n === prev + 1) prev = n
      else {
        flush()
        start = prev = n
      }
    }
    flush()
  }
  return [...parts, ...loose].join(', ')
}

const cap = (items: string[], n: number): string =>
  items.slice(0, n).join(', ') + (items.length > n ? ', …' : '')

/** One line per category, for the prompts ("Gates: A1–A8, B1–B10"). Empty when nothing is known. */
export function facilitySheet(f: FacilityFacts): string[] {
  const out: string[] = []
  const pairs = f.runways.filter((r) => r.includes('/'))
  if (f.runways.length) out.push(`Runways: ${(pairs.length ? pairs : f.runways).join(', ')}`)
  if (f.taxiways.length) out.push(`Taxiways: ${f.taxiways.join(', ')}`)
  if (f.gates.length) out.push(`Gates (the complete list): ${gateList(f.gates)}`)
  if (f.concourses.length) out.push(`Concourses: ${f.concourses.join(', ')}`)
  if (f.rooms.length) out.push(`Rooms/levels/doors: ${cap(f.rooms, 20)}`)
  if (f.hosts.length) out.push(`Hostnames: ${cap(f.hosts, 25)}`)
  if (f.ipPrefixes.length)
    out.push(
      `IP ranges: ${cap(
        f.ipPrefixes.map((p) => `${p}.x`),
        10,
      )}`,
    )
  if (f.phones.length) out.push(`Phone numbers: ${cap(f.phones, 15)}`)
  if (f.agencies.length) out.push(`Agencies: ${cap(f.agencies, 15)}`)
  return out
}

// ---- lint -------------------------------------------------------------------------------

const NATO: Record<string, string> = {
  ALPHA: 'A',
  BRAVO: 'B',
  CHARLIE: 'C',
  DELTA: 'D',
  ECHO: 'E',
  FOXTROT: 'F',
  GOLF: 'G',
  HOTEL: 'H',
  INDIA: 'I',
  JULIET: 'J',
  KILO: 'K',
  LIMA: 'L',
  MIKE: 'M',
}

export interface UnknownId {
  kind: 'runway' | 'taxiway' | 'gate' | 'concourse'
  id: string
  /** What the documents list instead. */
  known: string
}

const PRIVATE_IP = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/

/** What the sheet shows for a category: runway pairs, gate ranges, plain lists otherwise. */
function knownLabel(kind: UnknownId['kind'], known: string[]): string {
  if (kind === 'gate') return gateList(known)
  if (kind === 'runway') {
    const pairs = known.filter((r) => r.includes('/'))
    return (pairs.length ? pairs : known).join(', ')
  }
  return known.join(', ')
}

/**
 * Runways, taxiways, gates and concourses in `text` that the facts do not cover (PRD FR-6);
 * empty for a category the documents never mention. Rooms and levels are shown to the model
 * but not linted: a parking deck's "Level 3" is not a terminal level.
 */
export function unknownFacilityIds(text: string, f: FacilityFacts): UnknownId[] {
  const out: UnknownId[] = []
  const seen = new Set<string>()
  const push = (kind: UnknownId['kind'], id: string, known: string[]): void => {
    const key = `${kind}:${id}`
    if (seen.has(key) || !known.length || known.includes(id)) return
    seen.add(key)
    out.push({ kind, id, known: knownLabel(kind, known) })
  }
  for (const m of text.matchAll(RUNWAY)) {
    for (const end of [m[1], m[2]]) if (end) push('runway', end.toUpperCase(), f.runways)
  }
  for (const m of text.matchAll(/\bTaxiways?\s+([A-Z][a-z]*|[A-Z]\d?)\b/g)) {
    const raw = m[1]!.toUpperCase()
    push('taxiway', NATO[raw] ?? raw, f.taxiways)
  }
  for (const m of text.matchAll(/\bGates?\s+([A-Z]?\d{1,3}[A-Z]?)\b/g))
    push('gate', m[1]!.toUpperCase(), f.gates)
  for (const m of text.matchAll(/\bConcourses?\s+([A-Z])\b/g))
    push('concourse', m[1]!, f.concourses)
  return out
}

/** Private addresses outside every documented /16 (the documents' IP schema), informational. */
export function foreignPrivateIps(text: string, f: FacilityFacts): string[] {
  if (!f.ipPrefixes.length) return []
  const sixteens = new Set(f.ipPrefixes.map((p) => p.split('.').slice(0, 2).join('.')))
  const out = new Set<string>()
  for (const m of text.matchAll(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g)) {
    if (PRIVATE_IP.test(m[0]) && !sixteens.has(m[1]!)) out.add(m[0])
  }
  return [...out]
}

const describe = (u: UnknownId): string =>
  `${u.kind[0]!.toUpperCase()}${u.kind.slice(1)} ${u.id} (the documents list ${u.known})`

/** Rows that name runways, taxiways, gates, concourses or rooms the documents do not have. */
export function lintFacilityIds(s: Scenario, f: FacilityFacts): LintWarning[] {
  return s.msel.flatMap((row): LintWarning[] => lintRowFacility(row, f))
}

export function lintRowFacility(row: MselRow, f: FacilityFacts): LintWarning[] {
  const text = `${row.event}\n${row.expectedAction}`
  if (FAKE_FRAMING.test(text)) return []
  const unknown = unknownFacilityIds(text, f)
  if (!unknown.length) return []
  return [
    {
      code: FACILITY_UNKNOWN_ID,
      severity: 'warning',
      message: `Row ${row.id} names ${unknown.map(describe).join('; ')}, which the documents do not have`,
      suggestion:
        'Use an identifier from the facility facts, or frame it as the attacker’s fake data',
      source: 'lint',
      rowId: row.id,
    },
  ]
}
