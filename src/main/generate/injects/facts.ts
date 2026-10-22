// "Facts so far": identifiers already established by the MSEL and earlier injects, so each
// inject_text call keeps hostnames, IPs, flight numbers, ticket numbers, gates, handles and
// named people consistent instead of inventing a second AODB server.
import type { Inject, MselRow } from '@shared/schemas'

export interface Fact {
  kind: 'host' | 'ip' | 'flight' | 'ticket' | 'place' | 'handle' | 'file' | 'person'
  value: string
  /** Row or inject id that first established it. */
  source: string
}

const PATTERNS: { kind: Fact['kind']; re: RegExp }[] = [
  { kind: 'ip', re: /\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g },
  // OPS_INTERN_03, AODB_SQL_MASTER, FIDS-WEB-01, ncia-aodb01.ncia.local
  {
    kind: 'host',
    re: /\b[A-Z][A-Z0-9]{1,}(?:[_-][A-Z0-9]{1,}){1,}\b|\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.(?:local|corp|lan|internal|net|com|org|gov)\b/g,
  },
  {
    kind: 'flight',
    re: /\b(?:[A-Z]{2}|[A-Z]\d|\d[A-Z])\s?\d{2,4}\b(?=[^\w]|$)|\bFlight\s+#?\d{1,4}\b/g,
  },
  { kind: 'ticket', re: /\b(?:Ticket|INC|REQ|TKT|Case|SR)\s*#?\s*[A-Z]{0,3}\d{3,}\b/gi },
  {
    kind: 'place',
    re: /\b(?:Gate|Door|Belt|Carousel|Checkpoint|Level|Concourse|Terminal|Runway|Pier|Lane)\s+[A-Z]?\d{1,3}[A-Z]?\b|\b(?:Gate|Door|Concourse)\s+[A-Z]\b/gi,
  },
  { kind: 'handle', re: /(?:^|[\s("'])(@[A-Za-z0-9_]{3,})/g },
  { kind: 'file', re: /\b[\w-]+\.(?:ps1|exe|dll|sh|py|bat|vbs|js|zip|7z|pdf|docx?|xlsx?|sql)\b/gi },
  // "Kyle (Summer Intern)", "Karen S.", "Officer Ramirez"
  {
    kind: 'person',
    re: /\b(?:Officer|Sgt\.?|Captain|Chief|Director|Manager|Agent|Dr\.?)\s+[A-Z][a-z]+\b|\b[A-Z][a-z]+\s+[A-Z]\.(?=\s|$)|\b[A-Z][a-z]+\s+\((?:Summer\s+)?Intern[^)]*\)/g,
  },
]

/** Capitalised-only words that the host/flight regexes mistake for identifiers. */
const NOISE = new Set([
  'STARTEX',
  'ENDEX',
  'URGENT',
  'DECISION',
  'POINT',
  'TIME',
  'JUMP',
  'TSA',
  'FBI',
  'PIO',
  'FIDS',
  'AODB',
  'BHS',
  'PACS',
  'AOC',
  'EOC',
  'ICS',
  'SAC',
  'PA',
  'IT',
  'OPS',
  'ASC',
  'LEO',
])

const strings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

function extract(text: string, source: string, into: Map<string, Fact>): void {
  for (const { kind, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const raw = (m[1] ?? m[0]).trim()
      const value = kind === 'ip' || kind === 'host' ? raw : raw.replace(/\s+/g, ' ')
      if (NOISE.has(value.toUpperCase()) || value.length < 3) continue
      if (kind === 'flight' && /^(?:\d[A-Z]|[A-Z]\d)/.test(value) && !/^Flight/i.test(value))
        continue
      // Talkgroups (TG 4105), channels, cameras, tape libraries and call ids look like flights.
      if (kind === 'flight' && /^(?:TG|CH|CAM|TL|CR|CB|NVR|ID|TK)\s?\d/.test(value)) continue
      const key = `${kind}:${value.toLowerCase()}`
      if (!into.has(key)) into.set(key, { kind, value, source })
    }
  }
}

const MAX_FACTS = 80

/**
 * Facts from every MSEL row up to and including `row`, then from the injects already
 * written for earlier rows (their fields hold the detail the MSEL only summarised).
 */
export function factsSoFar(rows: MselRow[], row: MselRow, priorInjects: Inject[]): Fact[] {
  const into = new Map<string, Fact>()
  const at = rows.findIndex((r) => r.id === row.id)
  const upTo = at < 0 ? rows : rows.slice(0, at + 1)
  for (const r of upTo) extract(`${r.event}\n${r.expectedAction}`, r.id, into)
  const byRow = new Map(rows.map((r, i) => [r.id, i]))
  for (const inj of priorInjects) {
    const pos = byRow.get(inj.mselRowId) ?? Number.MAX_SAFE_INTEGER
    if (at >= 0 && pos >= at) continue
    extract([inj.title, ...strings(inj.fields)].join('\n'), inj.mselRowId, into)
  }
  return [...into.values()].slice(0, MAX_FACTS)
}

/** Grouped one-liners for the prompt: "hosts: AODB_SQL_MASTER (I-09), OPS_INTERN_03 (I-08b)". */
export function formatFacts(facts: Fact[]): string[] {
  const labels: Record<Fact['kind'], string> = {
    host: 'hosts',
    ip: 'IP addresses',
    flight: 'flights',
    ticket: 'tickets',
    place: 'places',
    handle: 'social handles',
    file: 'files',
    person: 'people',
  }
  const out: string[] = []
  for (const kind of Object.keys(labels) as Fact['kind'][]) {
    const items = facts.filter((f) => f.kind === kind)
    if (!items.length) continue
    out.push(`${labels[kind]}: ${items.map((f) => `${f.value} (${f.source})`).join(', ')}`)
  }
  return out
}
