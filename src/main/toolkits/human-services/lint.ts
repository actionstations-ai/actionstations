// Format checks for the human services toolkits (spec 0464 FR-6), as pure functions over text
// or fields. Each states its source and date in its message so a user can see why a draft was
// sent back. Sources are the ones in the toolkit knowledge: GAO-26-108114 (988 routing, status as
// of March 2026), FEMA's guidance on functional needs support services in general population
// shelters (2010), and 44 CFR 206.171 with Stafford Act section 416 (crisis counseling program).

export interface HsProblem {
  message: string
}

/** Sentences of a text, split on end punctuation. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean)
}

const REROUTE = String.raw`\bre-?rout\w*`
const AFTER_TWO = String.raw`\b(?:after|within|in)\s+(?:about\s+|roughly\s+|around\s+)?(?:2|two)\s+minutes?\b`
const AFTER_FIVE = String.raw`\b(?:after|within|in)\s+(?:about\s+|roughly\s+|around\s+)?(?:5|five)\s+minutes?\b`
const TEXT_TWO = new RegExp(
  `\\b(?:texts?|chats?)\\b[^.]{0,60}${REROUTE}[^.]{0,40}${AFTER_TWO}`,
  'i',
)
const CALL_FIVE = new RegExp(`\\bcalls?\\b[^.]{0,60}${REROUTE}[^.]{0,40}${AFTER_FIVE}`, 'i')
const NEGATION = /\b(?:cannot|can't|can not|not|never|no|unable|isn't|aren't|won't)\b/i

/** 988 rerouting (GAO-26-108114, March 2026): calls about 2 minutes, texts and chats about 5, Spanish never. */
export function lint988Routing(text: string): HsProblem[] {
  const out: HsProblem[] = []
  for (const s of sentences(text).flatMap((x) => x.split(/[,;]/))) {
    if (TEXT_TWO.test(s))
      out.push({
        message:
          'Texts and chats reroute to backup after about 5 minutes, not 2 (GAO-26-108114, status as of March 2026).',
      })
    if (CALL_FIVE.test(s))
      out.push({
        message:
          'Calls reroute to backup after about 2 minutes, not 5 (GAO-26-108114, status as of March 2026).',
      })
    if (/\bspanish\b/i.test(s) && new RegExp(REROUTE, 'i').test(s) && !NEGATION.test(s))
      out.push({
        message:
          'Spanish-language contacts cannot be rerouted to backup (GAO-26-108114, status as of March 2026); the text says otherwise.',
      })
  }
  return out
}

const SEPARATE_TIER =
  /\b(?:special[- ]needs? shelters?|disabled (?:residents|people|evacuees) (?:are|were|will be) (?:moved|sent|transferred|taken) to a (?:separate|different) (?:shelter|area|wing)|separate shelter for (?:people|persons|residents|evacuees) with disabilit\w+)\b/i

/** FEMA FNSS guidance (2010): general population shelters integrate people with access and functional needs. */
export function lintFnssIntegration(text: string): HsProblem[] {
  return SEPARATE_TIER.test(text)
    ? [
        {
          message:
            'General population shelters integrate people with access and functional needs and support them in place (FEMA FNSS guidance, 2010); avoid wording that sets up a separate tier, such as "special needs shelter".',
        },
      ]
    : []
}

const ISP = /immediate services?(?: program)?\b([^.]{0,80})/i
const RSP = /regular services?(?: program)?\b([^.]{0,80})/i
const DURATION = /\b(\d+|\w+)[- ](day|week|month)s?\b/gi
const SIXTY = (n: string, u: string) =>
  (/^(?:60|sixty)$/i.test(n) && u === 'day') || (/^(?:2|two)$/i.test(n) && u === 'month')
const NINE = (n: string, u: string) => /^(?:9|nine)$/i.test(n) && u === 'month'

function durationsOf(tail: string): [string, string][] {
  return [...tail.matchAll(DURATION)].map((m) => [m[1]!, m[2]!.toLowerCase()])
}

/** Crisis counseling program: immediate services up to 60 days, regular services up to nine months (44 CFR 206.171). */
export function lintCrisisCounselingDurations(text: string): HsProblem[] {
  const out: HsProblem[] = []
  for (const s of sentences(text)) {
    const isp = ISP.exec(s)
    if (isp && durationsOf(isp[1]!).some(([n, u]) => !SIXTY(n, u)))
      out.push({
        message:
          'The crisis counseling immediate services program lasts up to 60 days (44 CFR 206.171); the text gives another length.',
      })
    const rsp = RSP.exec(s)
    if (rsp && durationsOf(rsp[1]!).some(([n, u]) => !NINE(n, u)))
      out.push({
        message:
          'The crisis counseling regular services program lasts up to nine months (44 CFR 206.171); the text gives another length.',
      })
  }
  return out
}

const NO_ID = /^\s*(?:no|none|not checked|n\/a|unverified|waived)\b/i

/** Reunification release log: a release row with identification not checked belongs in exceptions. */
export function lintReleaseIdentity(entries: unknown): HsProblem[] {
  if (!Array.isArray(entries)) return []
  return entries.flatMap((e, i): HsProblem[] =>
    typeof e === 'object' &&
    e !== null &&
    NO_ID.test(String((e as Record<string, unknown>).idChecked ?? ''))
      ? [
          {
            message: `Release ${i + 1} has no identification check. Release authority is verified by identity; a case without it goes to the exceptions zone, not the release log.`,
          },
        ]
      : [],
  )
}
