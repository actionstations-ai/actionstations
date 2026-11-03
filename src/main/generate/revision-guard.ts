// Deterministic guard for the critique revision (#590). A reviewer reading a scenario against
// the documents flags deliberate content (a fake phone number in a PRESSURE post, a rumor) as
// an error; the rewrite then "fixes" it and destroys the inject. The prompts say not to, and
// this module enforces it: a revised row is rejected when it changes the deliberate content
// of a PRESSURE / NOISE / RED_HERRING / MISINFORMATION row or changes who sends or receives.
import type { MselRow, Role, Scenario } from '@shared/schemas'
import { PURPOSE_TAG_INFO, type PurposeTag } from '@shared/taxonomy'
import { roleNamedBy } from './lint'

/** Rows whose false or irrelevant content is intentional: documents are not the yardstick. */
export const DELIBERATE_TAGS: ReadonlySet<PurposeTag> = new Set([
  'PRESSURE',
  'NOISE',
  'RED_HERRING',
  'MISINFORMATION',
  'DISTRACTION',
])

/** The tags a scenario uses with their meaning and whether their content is intentional, for the critique prompt. */
export function tagGuide(s: Scenario): { tag: string; meaning: string; deliberate: boolean }[] {
  const used = [...new Set(s.msel.map((r) => r.purposeTag))]
  return used.map((tag) => ({
    tag,
    meaning: PURPOSE_TAG_INFO[tag].meaning,
    deliberate: DELIBERATE_TAGS.has(tag),
  }))
}

export const isDeliberate = (tag: PurposeTag): boolean => DELIBERATE_TAGS.has(tag)

const PHONE = /\+?\d[\d().\s-]{5,}\d/g
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/gi
// Hostnames, ticket and unit ids: a word with both letters and digits, or digits after a hyphen.
const ID_LIKE = /\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g

const squash = (t: string): string => t.replace(/[\s().-]/g, '').toLowerCase()

/** Phone numbers, e-mail addresses, links and identifiers a row's event states. */
export function deliberateTokens(text: string): string[] {
  const found = [PHONE, EMAIL, URL_LIKE, ID_LIKE].flatMap((re) => text.match(re) ?? [])
  return [...new Set(found.map(squash).filter((t) => t.length >= 4))]
}

/** Tokens of a deliberate row that a critique note (message + fix) talks about. */
export function tokensNotedBy(row: MselRow, noteText: string): string[] {
  const note = squash(noteText)
  return deliberateTokens(row.event).filter((t) => note.includes(t))
}

/** True when a critique note on this row only objects to the row's deliberate content. */
export const notesDeliberateContent = (row: MselRow, noteText: string): boolean =>
  isDeliberate(row.purposeTag) && tokensNotedBy(row, noteText).length > 0

const GENERIC_PARTY =
  /^\s*(?:the\s+)?(?:facilitator|controller|simcell|sim cell|exercise control)\s*$/i
const bare = (t: string): string =>
  t
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .trim()
    .toLowerCase()

function sameParty(a: string, b: string): boolean {
  const [x, y] = [bare(a), bare(b)]
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x))
}

interface Revised {
  from: string
  to: string[]
  event: string
}

const mentions = (text: string, party: string): boolean => {
  const p = bare(party)
  return p.length >= 4 && text.toLowerCase().includes(p)
}

/** Why the change of sender or recipients is rejected, or undefined when it is acceptable. */
function partyChangeReason(row: MselRow, rev: Revised, roles: Role[]): string | undefined {
  const recipients = new Set(row.toRoleIds)
  const revisedTo = rev.to.flatMap((k) => roleNamedBy(k, roles)?.id ?? [])
  const senderRole = roleNamedBy(row.from, roles)
  if (senderRole && revisedTo.includes(senderRole.id) && !recipients.has(senderRole.id))
    return `the original sender (${row.from}) became a recipient`
  const newSender = roleNamedBy(rev.from, roles)
  if (newSender && recipients.has(newSender.id) && !sameParty(row.from, rev.from))
    return `a recipient (${rev.from}) became the sender`
  if (revisedTo.length && recipients.size && !revisedTo.some((id) => recipients.has(id)))
    return 'the recipients were replaced'
  if (sameParty(row.from, rev.from) || GENERIC_PARTY.test(row.from)) return undefined
  if (mentions(row.event, rev.from))
    return `${rev.from}, named in the event as the other party, became the sender`
  if (isDeliberate(row.purposeTag)) return `the sender changed from ${row.from} to ${rev.from}`
  return undefined
}

/** Why a PRESSURE-style row's revision lost deliberate content, or undefined when it kept it. */
function deliberateContentReason(row: MselRow, rev: Revised): string | undefined {
  if (!isDeliberate(row.purposeTag)) return undefined
  const kept = squash(rev.event)
  const lost = deliberateTokens(row.event).filter((t) => !kept.includes(t))
  return lost.length
    ? `deliberate ${row.purposeTag} content changed (${lost.join(', ')})`
    : undefined
}

/** The reason a revised row must be rejected in favour of the original, or undefined. */
export function revisionRejection(row: MselRow, rev: Revised, roles: Role[]): string | undefined {
  return partyChangeReason(row, rev, roles) ?? deliberateContentReason(row, rev)
}
