// Slot extractors (#423, FR-10): typed statements a plan makes, found with table-driven
// regexes. Each statement says who or what fills a slot for a subject: who approves public
// releases, when a regulator must be notified, the phone number of a role, the level at which a
// centre activates, who leads a function. Two statements with the same slot and subject but
// different values are a candidate contradiction; a claim whose value differs from its cited
// passage's in the same slot is a conflicting anchor (grounding). Pure and deterministic.
import { collapseSpace, contentWords, normalizeText, phraseKey, UNIT_MINUTES } from './normalize'
import { canonicalUnit, digitsForWords } from './normalize'

export type SlotId =
  | 'release_approver'
  | 'approver'
  | 'notify_deadline'
  | 'report_deadline'
  | 'contact_phone'
  | 'activation_level'
  | 'lead'

export interface SlotStatement {
  slot: SlotId
  /** What the statement is about, as written ("public releases", "Ohio EPA"). */
  subject: string
  /** The value as written ("Director of Water Operations", "within 2 hours"). */
  value: string
  /** The value normalized for comparison (role phrase, minutes, digits, level number). */
  valueKey: string
  /** The exact text of the statement (a sentence or table row). */
  span: string
}

/** Weight for ranking candidate pairs (FR-14): authority and deadlines first. */
export const SLOT_WEIGHT: Record<SlotId, number> = {
  release_approver: 5,
  approver: 4,
  notify_deadline: 4,
  report_deadline: 4,
  activation_level: 3,
  lead: 3,
  contact_phone: 2,
}

export function slotLabel(slot: SlotId, subject: string): string {
  const s = subject.trim()
  switch (slot) {
    case 'release_approver':
      return 'Who approves public releases'
    case 'approver':
      return `Who approves ${s}`
    case 'notify_deadline':
      return `How soon ${s} must be notified`
    case 'report_deadline':
      return `How soon to report to ${s}`
    case 'contact_phone':
      return `Phone number for ${s}`
    case 'activation_level':
      return `Activation level for ${s}`
    case 'lead':
      return `Who leads ${s}`
  }
}

// ---- building blocks ----------------------------------------------------------------------

/** A capitalized name of a role, office or agency ("Director of Water Operations", "Ohio EPA"). */
const NAME = String.raw`(?:[A-Z][\w&/'-]*)(?:\s+(?:of|for|and|&|the|de)?\s*[A-Z][\w&/'-]*){0,6}`
/** Numbers as plans write them in deadlines: digits or words ("within two hours"). */
const COUNT = String.raw`(?:\d+(?:\.\d+)?|(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty-eight|forty|sixty|seventy-two|ninety|twenty-four)\b)`
const DURATION = String.raw`${COUNT}[\s-]*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)`
const PHONE = String.raw`(?<![\d-])(?:\(?\d{3}\)?[\s.-])?\d{3}[\s.-]\d{4}(?![\d-])`
const SUBJECT = String.raw`[^.;:\n|]{3,80}?`
const LEVEL = String.raw`(?:Level|Tier|Stage|Phase)\s+(?:\d+|[IVX]+|One|Two|Three|Four|Five)`

const RELEASE_WORDS =
  /\b(?:release|releases|statement|statements|advisor(?:y|ies)|notice|notices|press|media|news|public information|social media|post|posts|message|messages)\b/i

interface SlotRule {
  slot: 'approver' | 'notify_deadline' | 'report_deadline' | 'activation_level' | 'lead'
  re: RegExp
}

/** Named groups: s = subject, v = value. Order matters: the first rule that matches a span wins. */
const RULES: SlotRule[] = [
  // Approver / authority.
  {
    slot: 'approver',
    re: new RegExp(
      String.raw`(?<s>${SUBJECT})\s+(?:must|shall|will|may only|can only)?\s*(?:be\s+|is\s+|are\s+)?(?:approved|authori[sz]ed|signed off)\s+by\s+(?:the\s+)?(?<v>${NAME})`,
      'g',
    ),
  },
  {
    slot: 'approver',
    re: new RegExp(
      String.raw`\b[Oo]nly\s+(?:the\s+)?(?<v>${NAME})\s+(?:may|can|is authori[sz]ed to|has (?:the\s+)?authority to)\s+(?:approve\s+|authori[sz]e\s+|issue\s+|release\s+)?(?<s>${SUBJECT})(?=[.;\n]|$)`,
      'g',
    ),
  },
  {
    slot: 'approver',
    re: new RegExp(
      String.raw`(?:^|[.;]\s+|\n)(?:the\s+)?(?<v>${NAME})\s+(?:has (?:the\s+)?(?:sole\s+)?authority to|approves|authori[sz]es)\s+(?:approve\s+|authori[sz]e\s+|issue\s+|release\s+)?(?<s>${SUBJECT})(?=[.;\n]|$)`,
      'g',
    ),
  },
  {
    slot: 'approver',
    re: new RegExp(
      String.raw`\b(?:approval|authori[sz]ation) (?:of|for) (?<s>${SUBJECT})\s+(?:rests with|is (?:given )?by|comes from)\s+(?:the\s+)?(?<v>${NAME})`,
      'g',
    ),
  },
  // Notification deadlines.
  {
    slot: 'notify_deadline',
    re: new RegExp(
      String.raw`\bnotif(?:y|ies)\s+(?:the\s+)?(?<s>${NAME})\s+(?:[^.;\n]{0,40}?\s)?within\s+(?<v>${DURATION})`,
      'g',
    ),
  },
  {
    slot: 'notify_deadline',
    re: new RegExp(
      String.raw`(?:the\s+)?(?<s>${NAME})\s+(?:must|shall|will|is to)\s+be\s+notified\s+(?:[^.;\n]{0,40}?\s)?within\s+(?<v>${DURATION})`,
      'g',
    ),
  },
  {
    slot: 'notify_deadline',
    re: new RegExp(
      String.raw`\bnotification\s+(?:to|of)\s+(?:the\s+)?(?<s>${NAME})\s+(?:[^.;\n]{0,40}?\s)?within\s+(?<v>${DURATION})`,
      'g',
    ),
  },
  {
    slot: 'report_deadline',
    re: new RegExp(
      String.raw`\breport(?:s|ed)?\s+(?:[^.;\n]{0,40}?\s)?to\s+(?:the\s+)?(?<s>${NAME})\s+within\s+(?<v>${DURATION})`,
      'g',
    ),
  },
  // Activation levels.
  {
    slot: 'activation_level',
    re: new RegExp(
      String.raw`(?:the\s+)?(?<s>${NAME})\s+(?:is|will be|shall be)\s+activated\s+at\s+(?<v>${LEVEL})`,
      'g',
    ),
  },
  {
    slot: 'activation_level',
    re: new RegExp(
      String.raw`\bactivat(?:e|es)\s+(?:the\s+)?(?<s>${NAME})\s+at\s+(?<v>${LEVEL})`,
      'g',
    ),
  },
  // Lead for a function.
  {
    slot: 'lead',
    re: new RegExp(
      String.raw`(?:the\s+)?(?<v>${NAME})\s+(?:is|serves as|will serve as|acts as)\s+(?:the\s+)?lead(?:\s+agency)?\s+for\s+(?<s>${SUBJECT})(?=[.;\n]|$)`,
      'g',
    ),
  },
  {
    slot: 'lead',
    re: new RegExp(
      String.raw`\bthe\s+lead(?:\s+agency)?\s+for\s+(?<s>${SUBJECT})\s+is\s+(?:the\s+)?(?<v>${NAME})`,
      'g',
    ),
  },
]

// ---- value keys ---------------------------------------------------------------------------

/** Minutes of a duration phrase ("2 hours" → "120"); undefined when it is not one. */
export function durationMinutes(text: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)[\s-]*([a-z]+)/i.exec(digitsForWords(text))
  if (!m) return undefined
  const unit = canonicalUnit(m[2]!)
  return unit ? Number(m[1]) * UNIT_MINUTES[unit]! : undefined
}

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 }

function levelKey(text: string): string {
  const n = normalizeText(text).split(' ').at(-1) ?? ''
  return String(ROMAN[n] ?? n)
}

/** Leading articles and trailing filler dropped from a role or agency name. */
function cleanName(name: string): string {
  return collapseSpace(name.replace(/^(?:the|a|an)\s+/i, '').replace(/[\s,.'-]+$/, ''))
}

function valueKey(slot: SlotId, value: string): string {
  if (slot === 'notify_deadline' || slot === 'report_deadline')
    return String(durationMinutes(value) ?? phraseKey(value))
  if (slot === 'contact_phone') return value.replace(/\D/g, '')
  if (slot === 'activation_level') return levelKey(value)
  return phraseKey(cleanName(value))
}

// ---- extraction ---------------------------------------------------------------------------

/** The sentence (or table row / line) of `text` that holds offset `at`. */
function spanAt(text: string, at: number): string {
  const startLine = text.lastIndexOf('\n', at) + 1
  const endLine = text.indexOf('\n', at)
  const line = text.slice(startLine, endLine < 0 ? text.length : endLine)
  if (line.trimStart().startsWith('|')) return collapseSpace(line)
  const offset = at - startLine
  const before = line.slice(0, offset)
  const sentenceStart = Math.max(before.lastIndexOf('. ') + 2, before.lastIndexOf('; ') + 2, 0)
  const rest = line.slice(offset)
  const end = /[.;](?:\s|$)/.exec(rest)
  return collapseSpace(line.slice(sentenceStart, offset + (end ? end.index + 1 : rest.length)))
}

function subjectOf(slot: SlotRule['slot'], subject: string): { slot: SlotId; subject: string } {
  const s = cleanName(subject.replace(/^(?:all|any|every|each)\s+/i, ''))
  if (slot === 'approver' && RELEASE_WORDS.test(s)) return { slot: 'release_approver', subject: s }
  return { slot, subject: s }
}

function ruleStatements(text: string): SlotStatement[] {
  const out: SlotStatement[] = []
  for (const rule of RULES) {
    for (const m of text.matchAll(rule.re)) {
      const g = m.groups ?? {}
      if (!g.s || !g.v) continue
      const { slot, subject } = subjectOf(rule.slot, g.s)
      const value = cleanName(g.v)
      if (!contentWords(subject).length || !value) continue
      const at = (m.index ?? 0) + m[0].indexOf(g.v)
      out.push({ slot, subject, value, valueKey: valueKey(slot, value), span: spanAt(text, at) })
    }
  }
  return out
}

/** Phone numbers next to a role or office: a table row with a name cell, or "Name: 555-…". */
function phoneStatements(text: string): SlotStatement[] {
  const out: SlotStatement[] = []
  for (const line of text.split('\n')) {
    const phones = [...line.matchAll(new RegExp(PHONE, 'g'))]
    if (phones.length !== 1) continue
    const phone = phones[0]![0]
    let subject: string | undefined
    if (line.trimStart().startsWith('|')) {
      const cells = line.split('|').map((c) => c.trim())
      subject = cells.find((c) => c && /^[A-Z]/.test(c) && !/\d{3}/.test(c) && c.length <= 80)
    } else {
      const m = new RegExp(
        String.raw`(?<s>${NAME})\s*(?:\([^)]*\))?\s*(?:[:,–-]|at|phone|tel\.?)\s*${PHONE}`,
      ).exec(line)
      subject = m?.groups?.s
    }
    if (!subject || !contentWords(subject).length) continue
    out.push({
      slot: 'contact_phone',
      subject: cleanName(subject),
      value: phone,
      valueKey: valueKey('contact_phone', phone),
      span: line.trimStart().startsWith('|')
        ? collapseSpace(line)
        : spanAt(text, line.indexOf(phone)),
    })
  }
  return out
}

/** Every slot statement in a passage, without duplicates (same slot, subject and value). */
export function extractStatements(text: string): SlotStatement[] {
  const seen = new Set<string>()
  return [...ruleStatements(text), ...phoneStatements(text)].filter((s) => {
    const key = `${s.slot}\u0000${phraseKey(s.subject)}\u0000${s.valueKey}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Token-set similarity of two subjects (Jaccard over content words). */
export function subjectSimilarity(a: string, b: string): number {
  const x = new Set(contentWords(a))
  const y = new Set(contentWords(b))
  if (!x.size || !y.size) return 0
  let shared = 0
  for (const t of x) if (y.has(t)) shared += 1
  return shared / (x.size + y.size - shared)
}

/** Same slot and a matching subject (normalized equal, or token similarity ≥ threshold). */
export function sameSubject(a: SlotStatement, b: SlotStatement, threshold: number): boolean {
  if (a.slot !== b.slot) return false
  if (a.slot === 'release_approver') return true
  if (phraseKey(a.subject) === phraseKey(b.subject)) return true
  return subjectSimilarity(a.subject, b.subject) >= threshold
}

/** Two statements disagree: same slot and subject, different values (one not inside the other). */
export function valuesDiffer(a: SlotStatement, b: SlotStatement): boolean {
  if (a.valueKey === b.valueKey) return false
  if (a.slot === 'notify_deadline' || a.slot === 'report_deadline' || a.slot === 'contact_phone')
    return true
  if (a.slot === 'activation_level') return true
  // Role names: "Director" and "Director of Water Operations" are the same office.
  const x = ` ${a.valueKey} `
  const y = ` ${b.valueKey} `
  return !x.includes(y) && !y.includes(x)
}
