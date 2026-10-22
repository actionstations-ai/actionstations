// Structural lints the prompts alone do not prevent (#164, #174): an inject written in a
// player's own voice ("This is the DOM. I have made the decision…") whatever its `from` says,
// and rows that repeat an earlier row nearly verbatim. Pure; lint.ts adds them to
// lintScenario, and the critique step routes the flagged rows into the MSEL revision pass.
import type { LintWarning, MselRow, Role, Scenario } from '@shared/schemas'

export const INJECT_PLAYER_VOICE = 'INJECT_PLAYER_VOICE'
export const DUPLICATE_EVENT = 'DUPLICATE_EVENT'

const CONTROL_TAGS = new Set<MselRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])

const lower = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')
/** "Director of Flight Operations (DOM)" → "director of flight operations". */
const bareName = (name: string): string => lower(name.replace(/\s*\(.*?\)\s*/g, ' '))

// ---- player voice ---------------------------------------------------------------------------

/** "This is the DOM", "this is Marcus Bell": the speaker phrase up to the next punctuation. */
const THIS_IS = /\bthis is (?:the )?([^.,;:!?"“”\n]{2,60})/gi
/** "Glen Haskins to all.", "DOM here," at the start of a quote or sentence. */
const SPEAKER_TAG =
  /(?:^|["“]\s*|[.!?:]\s+)([A-Z][\w.'-]*(?: [A-Z][\w.'-]*){0,3})\s+(?:to all|here|speaking)\b/g
/** Trailing words that do not change who is speaking ("the DOM speaking", "Ops again"). */
const FILLER = /\s+(?:speaking|here|again|calling|on the line|to all)\s*$/i

/** "I am making a high-consequence operational decision", "I have made the decision". */
const OWN_DECISION =
  /\b(?:I|we)(?:'m|'ve|'re| am| have| are)?\s+(?:now\s+|hereby\s+)?(?:making|made|taking|taken)\s+(?:(?:a|the|my|our|this)\b[^.!?]{0,60}?\bdecision\b|the call\b)/i
/** "I'm declaring CODE GRAYLINE", "we are activating the EAP". */
const DECLARATION =
  /\b(?:I|we)(?:'m|'re| am| are)?\s+(?:now\s+|hereby\s+|officially\s+)?(?:declaring|declare|activating|activate|invoking|invoke|ordering|authori[sz]ing)\b([^.!?]{0,40})/i
const DECLARED_THING =
  /\b(?:code|level|condition|emergency|eap|eop|incident|evacuation|shutdown|stand-?down|unified command|eoc)\b/i
const TO_ALL = /\bto all\b|\ball (?:units|stations|staff|personnel|players)\b/i

const PERSON = String.raw`([A-Z][a-z'-]+(?: [A-Z]\.)?(?: [A-Z][a-z'-]+){1,2})`
/** "Glen Haskins" after a title ("DOM Glen Haskins"): only capitalized words. */
const PERSON_ONLY = /^[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){0,2}$/
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Every way the scenario's text names a role: abbreviation (case-sensitive), bare and full name. */
function roleTokens(r: Role): { re: string; flags: string }[] {
  const out: { re: string; flags: string }[] = []
  if (r.abbreviation && r.abbreviation.length >= 2)
    out.push({ re: escape(r.abbreviation), flags: 'g' })
  const name = bareName(r.name)
  if (name.length >= 4) out.push({ re: escape(name), flags: 'gi' })
  return out
}

/**
 * Person names the scenario ties to a player role ("PIO Marcus Bell drafts…", "Glen Haskins,
 * the Dam Operations Manager", "Marcus Bell (PIO)"), read from the role descriptions and every
 * row's text. A model that names its players lets the lint recognise them as speakers.
 */
export function namedPlayers(s: Scenario): Map<string, Role> {
  const corpus = [
    ...s.roles.flatMap((r) => [r.description, ...r.standingOrders]),
    ...s.msel.flatMap((r) => [r.event, r.expectedAction]),
  ].join('\n')
  const names = new Map<string, Role>()
  for (const role of s.roles) {
    for (const t of roleTokens(role)) {
      const patterns = [
        new RegExp(String.raw`\b${t.re}\s+${PERSON}`, t.flags),
        new RegExp(String.raw`${PERSON},?\s+(?:the\s+|our\s+)?${t.re}\b`, t.flags),
        new RegExp(String.raw`${PERSON}\s*\(${t.re}\)`, t.flags),
      ]
      for (const re of patterns)
        for (const m of corpus.matchAll(re)) {
          const person = m[1]!.trim()
          if (/^(?:The|This|Our|All|Director|Manager|Officer|Lead|Chief)\b/.test(person)) continue
          if (!names.has(person)) names.set(person, role)
        }
    }
  }
  return names
}

/** The player role a speaker phrase stands for: abbreviation, bare or full name, or a named player. */
function speakerRole(phrase: string, roles: Role[], people: Map<string, Role>): Role | undefined {
  const p = phrase.replace(FILLER, '').trim()
  if (p.length < 2) return undefined
  const byRole = roles.find((r) => {
    const name = bareName(r.name)
    const titles = [r.abbreviation, name.length >= 4 ? name : '', lower(r.name)].filter(Boolean)
    return titles.some((t) => {
      const exact = t === r.abbreviation ? p === t : lower(p) === t
      const head = t === r.abbreviation ? p.startsWith(`${t} `) : lower(p).startsWith(`${t} `)
      return exact || (head && PERSON_ONLY.test(p.slice(t.length).trim()))
    })
  })
  if (byRole) return byRole
  for (const [person, role] of people) if (p === person || p.startsWith(`${person} `)) return role
  return undefined
}

function speakers(event: string): string[] {
  return [
    ...[...event.matchAll(THIS_IS)].map((m) => m[1]!),
    ...[...event.matchAll(SPEAKER_TAG)].map((m) => m[1]!),
  ]
}

/** Why a row reads as a player's own announcement, or undefined when it does not. */
function playerVoice(
  row: MselRow,
  s: Scenario,
  people: Map<string, Role>,
): { who: string; quote: string } | undefined {
  const text = row.event
  for (const phrase of speakers(text)) {
    const role = speakerRole(phrase, s.roles, people)
    if (role) return { who: role.name, quote: phrase.trim() }
  }
  const own = OWN_DECISION.exec(text)
  if (own) return { who: 'a player', quote: own[0] }
  const decl = DECLARATION.exec(text)
  if (!decl) return undefined
  const forcing = row.purposeTag === 'DECISION_POINT' || TO_ALL.test(text)
  if (forcing || DECLARED_THING.test(decl[1] ?? '')) return { who: 'a player', quote: decl[0] }
  return undefined
}

/**
 * An inject whose event text is a player announcing their own decision (#164). `from` may
 * name anyone — "Outside Caller", "Frontline Staff" — so the text itself is read: a speaker
 * who identifies as a player role or a named player, or a first-person decision or
 * declaration ("I have made the decision", "I'm declaring CODE GRAYLINE").
 */
export function lintPlayerVoice(s: Scenario): LintWarning[] {
  const people = namedPlayers(s)
  return s.msel.flatMap((row): LintWarning[] => {
    if (CONTROL_TAGS.has(row.purposeTag) || /^\s*Facilitator prompt/i.test(row.event)) return []
    const hit = playerVoice(row, s, people)
    if (!hit) return []
    return [
      {
        code: INJECT_PLAYER_VOICE,
        severity: 'warning',
        message: `Row ${row.id} is written in the voice of ${hit.who} ("${hit.quote.slice(0, 60)}"): a player's own decision or announcement is not an inject`,
        suggestion:
          'Re-source it from a specific outside party whose demand, deadline or report forces the decision, and move the decision itself to the expected action',
        source: 'lint',
        rowId: row.id,
      },
    ]
  })
}

// ---- duplicate rows -------------------------------------------------------------------------

/** "Phone Call (Resident, Lakeview Rd):" and similar channel labels before the inject text. */
const CHANNEL_LABEL = /^[^:"“\n]{0,60}:\s*/

/** Event text with its channel label, quotes, punctuation and case removed. */
export function normalizedEvent(event: string): string {
  return event
    .replace(CHANNEL_LABEL, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** The longest quoted passage (a phone call's words), normalized; '' when under 40 chars. */
export function quotedSpeech(event: string): string {
  const quotes = [...event.matchAll(/["“]([^"”]{40,})["”]/g)].map((m) => m[1]!)
  const longest = quotes.sort((a, b) => b.length - a.length)[0] ?? ''
  return normalizedEvent(longest)
}

/** The same inject twice: equal normalized text, or the same quoted call word for word. */
export function sameInject(a: MselRow, b: MselRow): boolean {
  const na = normalizedEvent(a.event)
  if (na && na === normalizedEvent(b.event)) return true
  const qa = quotedSpeech(a.event)
  return !!qa && qa === quotedSpeech(b.event)
}

const words = (s: string): Set<string> => new Set(s.split(' ').filter((w) => w.length > 2))

/** Word-set overlap of two events (Jaccard), 0 when either is shorter than eight words. */
export function eventSimilarity(a: string, b: string): number {
  const wa = words(normalizedEvent(a))
  const wb = words(normalizedEvent(b))
  if (wa.size < 8 || wb.size < 8) return 0
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / (wa.size + wb.size - shared)
}

export const NEAR_DUPLICATE = 0.75

/** Rows that repeat an earlier row nearly verbatim (the later one is flagged). */
export function lintDuplicateEvents(s: Scenario): LintWarning[] {
  const out: LintWarning[] = []
  const rows = s.msel.filter((r) => !CONTROL_TAGS.has(r.purposeTag))
  rows.forEach((row, i) => {
    const earlier = rows
      .slice(0, i)
      .find((e) => sameInject(e, row) || eventSimilarity(e.event, row.event) >= NEAR_DUPLICATE)
    if (!earlier) return
    out.push({
      code: DUPLICATE_EVENT,
      severity: 'warning',
      message: `Row ${row.id} repeats row ${earlier.id} nearly verbatim`,
      suggestion: `Write a different inject that moves the story on from ${earlier.id}, or delete one of them`,
      source: 'lint',
      rowId: row.id,
    })
  })
  return out
}
