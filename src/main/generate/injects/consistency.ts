// Deterministic content checks on an inject's fields, run after the schema check and sent
// back with it in the one repair round: template examples copied into the page (#105), the
// technical coherence of logs (OS ↔ tooling, failed-yet-affected rows, a host paired with a
// different address than the story established) and facility identifiers the documents do not
// have (#84). What survives the repair becomes an INJECT_CONTENT_ISSUE warning.
import type { MselRow } from '@shared/schemas'
import {
  FAKE_FRAMING,
  describeUnknownId,
  unknownFacilityIds,
  type FacilityFacts,
} from '../facility'

type Fields = Record<string, unknown>
type JsonSchema = Record<string, unknown>

export interface ContentIssue {
  /** Field path as the model sees it ("fields.role", "fields.lines"). */
  path: string
  message: string
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Examples long enough to be a copied subject rather than a format ("4492", "AM" are not). */
const MIN_EXAMPLE = 12

/**
 * Fields that carry WHO the page is from or about. Only these are checked for a copied
 * example: a structural field's example is often the right value for the organization
 * ("Airport Operations Center (AOC)", "Salidas · Départs"), a persona's never is.
 */
const IDENTITY_FIELD =
  /(?:^|\.)(?:role|persona|organization|org|outlet|fromName|fromOrg|reporterName|handle|displayName|authorName|groupName|callsign|agency|station|subreddit|signatureBlock|from|to|cc|requester|assignee|byline|author|name|label)(?:\[\])?$/

/** (path, examples[]) for every string-typed property, one level into objects and array items. */
function stringExamples(schema: JsonSchema, prefix = 'fields'): [string, string[]][] {
  const out: [string, string[]][] = []
  const props = (schema.properties ?? {}) as Record<string, JsonSchema>
  for (const [name, s] of Object.entries(props)) {
    const path = `${prefix}.${name}`
    if (s.type === 'string' && !Array.isArray(s.enum) && Array.isArray(s.examples)) {
      out.push([path, s.examples.filter((e): e is string => typeof e === 'string')])
    } else if (s.type === 'object') out.push(...stringExamples(s, path))
    else if (s.type === 'array') {
      const items = (s.items ?? {}) as JsonSchema
      if (items.type === 'string' && Array.isArray(items.examples))
        out.push([path, items.examples.filter((e): e is string => typeof e === 'string')])
      else if (items.type === 'object') out.push(...stringExamples(items, `${path}[]`))
    }
  }
  return out
}

/** Values at a dotted path ("fields.lines[].msg"); arrays fan out. */
function valuesAt(fields: Fields, path: string): string[] {
  let current: unknown[] = [fields]
  for (const part of path
    .replace(/^fields\.?/, '')
    .split('.')
    .filter(Boolean)) {
    const [key, isArray] = part.endsWith('[]') ? [part.slice(0, -2), true] : [part, false]
    current = current.flatMap((v) => {
      const next = v && typeof v === 'object' ? (v as Fields)[key] : undefined
      return isArray ? (Array.isArray(next) ? next : []) : [next]
    })
  }
  return current
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .filter((v): v is string => typeof v === 'string')
}

/** A value that is a template example word for word (or contains a long one) when the row never said it. */
export function exampleCopies(fields: Fields, schema: JsonSchema, rowText: string): ContentIssue[] {
  const allowed = norm(rowText)
  const out: ContentIssue[] = []
  for (const [path, examples] of stringExamples(schema)) {
    if (!IDENTITY_FIELD.test(path)) continue
    for (const value of valuesAt(fields, path)) {
      const v = norm(value)
      const hit = examples.find((e) => {
        const ex = norm(e)
        if (ex.length < MIN_EXAMPLE || allowed.includes(ex)) return false
        return v === ex || (ex.length >= 16 && v.includes(ex))
      })
      if (hit !== undefined) {
        out.push({
          path,
          message: `"${hit.trim()}" is the template's example, not this row's content; write what the row's source and event say`,
        })
        break
      }
    }
  }
  return out
}

const LINUX = /\b(?:linux|ubuntu|debian|rhel|red hat|centos|rocky|alma|fedora|suse)\b/i
const WINDOWS = /\bwindows\b/i
const WIN_TOOLS = /\.ps1\b|powershell|\bC:\\|\.bat\b|cmd\.exe|\bMSSQL|\bnet user\b|\.exe\b/i
const NIX_TOOLS =
  /\/var\/log|\/opt\/|\/etc\/|\bsudo\b|\bbash\b|systemd|\bapt(?:-get)?\b|\byum\b|\bchmod\b/i
const FAILED_ROWS =
  /\b(?:script|command|query|job|statement|update) failed\b[^.\n]{0,40}?\b([1-9]\d*)\s+rows?\s+affected/i
const TECH_TYPES = new Set([
  'system_log',
  'console_dump',
  'siem_alert',
  'error_dialog',
  'email_header_analysis',
])

const HOST = String.raw`[A-Z][A-Z0-9]{1,}(?:[_-][A-Z0-9]{1,})+`
const IP = String.raw`\d{1,3}(?:\.\d{1,3}){3}`
const IP_THEN_HOST = new RegExp(String.raw`\b(${IP})\s*\((${HOST})\)`, 'g')
const HOST_THEN_IP = new RegExp(String.raw`\b(${HOST})\s*\((${IP})\)`, 'g')
const HOST_AT_IP = new RegExp(String.raw`\b(${HOST})\s+(?:at|@|=|is|from)\s+(${IP})\b`, 'g')

/** host → address as the story pairs them ("OPS_INTERN_03 (192.168.1.55)"); first pairing wins. */
export function hostIpPairings(texts: string[]): Map<string, string> {
  const pairs = new Map<string, string>()
  const put = (host: string, ip: string): void => {
    if (!pairs.has(host.toUpperCase())) pairs.set(host.toUpperCase(), ip)
  }
  for (const text of texts) {
    for (const m of text.matchAll(IP_THEN_HOST)) put(m[2]!, m[1]!)
    for (const m of text.matchAll(HOST_THEN_IP)) put(m[1]!, m[2]!)
    for (const m of text.matchAll(HOST_AT_IP)) put(m[1]!, m[2]!)
  }
  return pairs
}

const strings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

/** OS ↔ tooling, failed-yet-affected rows, and host/address pairs that contradict the story. */
export function technicalIssues(
  type: string,
  fields: Fields,
  established: Map<string, string>,
): ContentIssue[] {
  if (!TECH_TYPES.has(type)) return []
  const out: ContentIssue[] = []
  const os = typeof fields.os === 'string' ? fields.os : ''
  const body = strings({ ...fields, os: undefined }).join('\n')
  if (LINUX.test(os) && WIN_TOOLS.test(body))
    out.push({
      path: 'fields.os',
      message: `"${os}" is Linux, but the lines use Windows tooling (PowerShell, .ps1, C:\\ paths or MSSQL); make the OS and the tooling agree`,
    })
  if (WINDOWS.test(os) && NIX_TOOLS.test(body))
    out.push({
      path: 'fields.os',
      message: `"${os}" is Windows, but the lines use Linux paths or commands (/var/log, sudo, bash); make the OS and the tooling agree`,
    })
  const failed = FAILED_ROWS.exec(body)
  if (failed)
    out.push({
      path: 'fields.lines',
      message: `"${failed[0]}": a failed command affects no rows; say it succeeded, or report 0 rows affected`,
    })
  for (const [host, ip] of hostIpPairings([body])) {
    const known = established.get(host)
    if (known && known !== ip)
      out.push({
        path: 'fields.lines',
        message: `${ip} is paired with ${host}, but the story established ${host} as ${known}; keep the established address`,
      })
  }
  return out
}

/**
 * Facility identifiers in the fields that the documents do not have, unless the row or the
 * fields frame them as fake (the same framing the MSEL lint accepts, facility.ts).
 */
export function facilityFieldIssues(
  fields: Fields,
  facts: FacilityFacts,
  row: MselRow,
): ContentIssue[] {
  const text = strings(fields).join('\n')
  const framing = `${row.event}\n${row.expectedAction}\n${text}`
  if (FAKE_FRAMING.test(framing)) return []
  return unknownFacilityIds(text, facts).map((u) => ({
    path: 'fields',
    message: `${describeUnknownId(u)} is not in the facility facts; use ${u.didYouMean ? 'the documented name' : 'one that exists'}`,
  }))
}

export interface ContentCheckInput {
  type: string
  fields: Fields
  schema: JsonSchema
  row: MselRow
  facility: FacilityFacts
  /** Earlier MSEL rows and injects, for host/address pairings. */
  storyTexts: string[]
  /** Names the scenario owns (roles, organization, brand aliases): never a copied example. */
  knownText?: string
}

/** Every content issue for one inject, in a stable order. */
export function contentIssues(input: ContentCheckInput): ContentIssue[] {
  const { type, fields, schema, row, facility, storyTexts, knownText = '' } = input
  const rowText = `${row.from}\n${row.event}\n${row.expectedAction}`
  // An example that the story already uses (an AODB host the MSEL named) is not a leak.
  const known = [rowText, knownText, ...storyTexts].join('\n')
  return [
    ...exampleCopies(fields, schema, known),
    ...technicalIssues(type, fields, hostIpPairings([rowText, ...storyTexts])),
    ...facilityFieldIssues(fields, facility, row),
  ]
}
