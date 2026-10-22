// Facility-fact categories (#84, #143). A category says how to find its identifiers in the
// documents, how the prompt sheet shows them and (optionally) how to spot them in generated
// text for the lint. The airport list and the generic list are the defaults; a domain profile
// passes its own list to extractFacilityFacts. Facts carry only { id, label, entries }, so a
// category the user adds in facility-facts.md works without code (shown to the model, not
// linted).

export interface FactCategory {
  /** Stable key, also written into facility-facts.md (`<!-- category: gates -->`). */
  id: string
  /** Section heading in facility-facts.md. */
  label: string
  /** Singular noun for lint messages ("Gate C12"); categories without `mentions` never lint. */
  noun?: string
  /** Prompt-sheet label when it differs from `label`. */
  sheetLabel?: string
  /** Identifiers in one document. `real` omits sentences that call an identifier fake. */
  extract(text: { all: string; real: string }): Iterable<string>
  /** Tidy the merged entries (sort, drop singles a pair covers, compress ranges). */
  finalize?(entries: string[]): string[]
  /** Entries → every identifier they stand for ("A1–A3" → A1, A2, A3; "5/23" → 5, 23, 5/23). */
  expand?(entries: string[]): string[]
  /** How the prompt sheet and lint messages list the entries. */
  format?(entries: string[]): string
  /** Identifiers of this category named in generated text (normalized like `expand`). */
  mentions?(text: string): Iterable<string>
}

/** A category's entries in a FacilityFacts. */
export interface FactCategoryEntries {
  id: string
  label: string
  entries: string[]
}

// ---- id lists and ranges ------------------------------------------------------------------

/** A list of ids after a noun: "A1–A8, B1–B10", "A and B", "5/23 and 1/19". */
const ID_LIST = String.raw`([A-Z]?\d{1,3}[A-Z]?|[A-Z])\b(?:\s*(?:[–-]|,|and|&|\/)\s*(?:[A-Z]?\d{1,3}[A-Z]?|[A-Z])\b)*`

/** "A1–A8" → A1 … A8; "5/23" → both; other items pass through (ids uppercased). */
export function expandIds(list: string): string[] {
  const out: string[] = []
  for (const item of list.toUpperCase().split(/\s*(?:,|\bAND\b|&|\/)\s*/)) {
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

/** Small models read "B17" into "B1–B10"; a short list is spelled out, a long one ranged. */
const ENUMERATE_UP_TO = 40

/** Gate ids for the model: every id when the list is short, else "A1–A8, B1–B10, 24". */
export function gateList(ids: string[]): string {
  return ids.length <= ENUMERATE_UP_TO ? ids.join(', ') : compressIds(ids)
}

const unique = (xs: Iterable<string>): string[] => [...new Set(xs)]
const sorted = (xs: string[]): string[] => [...xs].sort()
const capped =
  (n: number) =>
  (items: string[]): string =>
    items.slice(0, n).join(', ') + (items.length > n ? ', …' : '')

function* listAfter(re: RegExp, text: string, noun: RegExp): Iterable<string> {
  for (const m of text.matchAll(re)) yield* expandIds(m[0].replace(noun, ''))
}

// ---- airport profile ----------------------------------------------------------------------

const RUNWAY = /\bRunways?\s+(\d{1,2}[LRC]?)(?:\s*\/\s*(\d{1,2}[LRC]?))?/gi
/** "Runways 5/23 and 1/19", "Runway 23": the whole list after the noun. */
const RUNWAY_LIST =
  /\bRunways?\s+(\d{1,2}[LRC]?(?:\s*\/\s*\d{1,2}[LRC]?)?(?:\s*(?:,|and|&)\s*\d{1,2}[LRC]?(?:\s*\/\s*\d{1,2}[LRC]?)?)*)/gi
const TAXIWAY = new RegExp(String.raw`\bTaxiways?\s+${ID_LIST}`, 'gi')
const GATE = new RegExp(String.raw`\bGates?\s*[:(]?\s*${ID_LIST}`, 'gi')
const CONCOURSE = new RegExp(String.raw`\bConcourses?\s+${ID_LIST}`, 'gi')

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

/** Runway entries are pairs as written ("5/23") or single ends ("17"). */
const runwayEnds = (entries: string[]): string[] =>
  unique(entries.flatMap((e) => [e, ...e.split(/\s*\/\s*/)]).map((e) => e.trim().toUpperCase()))

export const RUNWAYS: FactCategory = {
  id: 'runways',
  label: 'Runways',
  noun: 'runway',
  *extract({ real }) {
    for (const m of real.matchAll(RUNWAY_LIST))
      for (const item of m[1]!.toUpperCase().split(/\s*(?:,|AND|&)\s*/))
        yield item.replace(/\s*\/\s*/, '/')
  },
  // A single end that a documented pair covers adds nothing.
  finalize: (entries) => {
    const ends = new Set(entries.filter((e) => e.includes('/')).flatMap((e) => e.split('/')))
    return unique(entries).filter((e) => e.includes('/') || !ends.has(e))
  },
  expand: runwayEnds,
  format: (entries) => entries.join(', '),
  *mentions(text) {
    for (const m of text.matchAll(RUNWAY))
      for (const end of [m[1], m[2]]) if (end) yield end.toUpperCase()
  },
}

export const TAXIWAYS: FactCategory = {
  id: 'taxiways',
  label: 'Taxiways',
  noun: 'taxiway',
  extract: ({ real }) => listAfter(TAXIWAY, real, /^Taxiways?\s+/i),
  finalize: (e) => sorted(unique(e)),
  expand: (entries) => unique(entries.flatMap(expandIds)),
  *mentions(text) {
    for (const m of text.matchAll(/\bTaxiways?\s+([A-Z][a-z]*|[A-Z]\d?)\b/g)) {
      const raw = m[1]!.toUpperCase()
      yield NATO[raw] ?? raw
    }
  },
}

export const GATES: FactCategory = {
  id: 'gates',
  label: 'Gates',
  noun: 'gate',
  sheetLabel: 'Gates (the complete list)',
  extract: ({ real }) => listAfter(GATE, real, /^Gates?\s*[:(]?\s*/i),
  // Stored as ranges ("A1–A8") so facility-facts.md stays short; expanded for use.
  finalize: (entries) =>
    compressIds(unique(entries.flatMap(expandIds)))
      .split(', ')
      .filter(Boolean),
  expand: (entries) => unique(entries.flatMap(expandIds)),
  format: (entries) => gateList(unique(entries.flatMap(expandIds))),
  *mentions(text) {
    for (const m of text.matchAll(/\bGates?\s+([A-Z]?\d{1,3}[A-Z]?)\b/g)) yield m[1]!.toUpperCase()
  },
}

export const CONCOURSES: FactCategory = {
  id: 'concourses',
  label: 'Concourses',
  noun: 'concourse',
  extract: ({ real }) => listAfter(CONCOURSE, real, /^Concourses?\s+/i),
  finalize: (e) => sorted(unique(e)),
  expand: (entries) => unique(entries.flatMap(expandIds)),
  *mentions(text) {
    for (const m of text.matchAll(/\bConcourses?\s+([A-Z])\b/g)) yield m[1]!
  },
}

export const AIRPORT_CATEGORIES: FactCategory[] = [RUNWAYS, TAXIWAYS, GATES, CONCOURSES]

// ---- generic (every organization type) ----------------------------------------------------

const ROOM =
  /\b(Room|Level|Floor|Door|Lot|Stairwell|Checkpoint|Shelter|Building|Wing|Zone|Bay|Dock|Platform|Station)\s+([A-Z]?\d{1,4}[A-Z]?|[A-Z])\b/g
const ASSET =
  /\b(Generator|Pump|Transformer|Substation|Feeder|Valve|Turbine|Boiler|Chiller|Engine|Ladder|Medic|Ambulance|Truck|Unit|Vehicle|Bus|Train|Crane|Tank|Panel|Drone|UAS)\s+(#?[A-Z]?\d{1,4}[A-Z]?)\b/g
const HOST =
  /\b[A-Z][A-Z0-9]{1,}(?:[_-][A-Z0-9]{1,}){1,}\b|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:local|corp|lan|internal|net|com|org|gov)\b/g
const IP = /\b(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3}|x)\b/gi
const PHONE = /\(?\b(\d{3})\)?[ -](\d{3})-(\d{4})\b/g
const AGENCY =
  /\b(?:FBI|TSA|FAA|CISA|NTSB|DHS|FEMA|CBP|ATF|DEA|NSA|EPA|OSHA|NRC|FERC|PHMSA|FRA|FTA|USCG|Coast Guard|National Guard|State Patrol|Highway Patrol)\b|\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s(?:Police|Fire|Sheriff'?s?|Emergency Management|Health|Public Health)\s(?:Department|Office|Agency|District)\b/g

/** Hyphenated words that look like hosts but are document vocabulary (HSPD-5, AES-256). */
const isHostLike = (token: string): boolean => {
  if (token.includes('.')) return true
  const parts = token.split(/[_-]/)
  if (parts.length >= 3) return true
  const [head, tail] = parts as [string, string]
  return /[A-Z]{2,}/.test(head) && (/^\d{2}$/.test(tail) || (/\d/.test(tail) && /[A-Z]/.test(tail)))
}

export const LOCATIONS: FactCategory = {
  id: 'locations',
  label: 'Locations / areas',
  sheetLabel: 'Rooms/levels/doors',
  *extract({ real }) {
    for (const m of real.matchAll(ROOM)) yield `${m[1]} ${m[2]}`
  },
  format: capped(20),
}

export const ASSETS: FactCategory = {
  id: 'assets',
  label: 'Assets / equipment',
  *extract({ real }) {
    for (const m of real.matchAll(ASSET)) yield `${m[1]} ${m[2]}`
  },
  format: capped(20),
}

export const HOSTS: FactCategory = {
  id: 'hosts',
  label: 'Systems / hosts',
  sheetLabel: 'Hostnames',
  *extract({ all }) {
    for (const m of all.matchAll(HOST)) if (isHostLike(m[0])) yield m[0]
  },
  format: capped(25),
}

/** Network entries are "/24" prefixes written as "10.66.0.x". */
export const NETWORKS: FactCategory = {
  id: 'networks',
  label: 'Networks / IP ranges',
  sheetLabel: 'IP ranges',
  *extract({ all }) {
    for (const m of all.matchAll(IP)) yield `${m[1]}.x`
  },
  format: capped(10),
}

export const PHONES: FactCategory = {
  id: 'phones',
  label: 'Phone numbers',
  *extract({ all }) {
    for (const m of all.matchAll(PHONE)) yield `(${m[1]}) ${m[2]}-${m[3]}`
  },
  format: capped(15),
}

export const AGENCIES: FactCategory = {
  id: 'agencies',
  label: 'Agencies / contacts',
  sheetLabel: 'Agencies',
  *extract({ all }) {
    for (const m of all.matchAll(AGENCY)) yield m[0]
  },
  format: capped(15),
}

export const GENERIC_CATEGORIES: FactCategory[] = [
  LOCATIONS,
  ASSETS,
  HOSTS,
  NETWORKS,
  PHONES,
  AGENCIES,
]

/** The current default set: the airport profile's categories plus the generic ones. */
export const DEFAULT_FACT_CATEGORIES: FactCategory[] = [
  ...AIRPORT_CATEGORIES,
  ...GENERIC_CATEGORIES,
]

/** The definition for a category id (defaults first), if any code knows it. */
export function categoryDefinition(
  id: string,
  categories: FactCategory[] = DEFAULT_FACT_CATEGORIES,
): FactCategory | undefined {
  return categories.find((c) => c.id === id) ?? DEFAULT_FACT_CATEGORIES.find((c) => c.id === id)
}
