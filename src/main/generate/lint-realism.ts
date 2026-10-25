// Content lints for realism defects the prompts alone did not prevent (#347): an outside agency
// that closes the incident or approves the restoration (federal and state partners advise,
// assist and receive reports; the exercising organization decides), a full restore of
// encrypted servers or a control network within the hour, and contact details that look real
// (an email or web domain that is not a reserved .example one, a 555 number outside
// 555-0100–0199, a geographic phone number). Pure; lint.ts adds them to lintScenario.
import { exerciseMinutes, type LintWarning, type MselRow, type Scenario } from '@shared/schemas'

export const OUTSIDE_AGENCY_DECIDES = 'OUTSIDE_AGENCY_DECIDES'
export const RESTORE_TOO_FAST = 'RESTORE_TOO_FAST'
export const CONTACT_REAL_LOOKING = 'CONTACT_REAL_LOOKING'

type W = LintWarning
const warn = (code: string, message: string, rowId: string, suggestion: string): W => ({
  code,
  severity: 'warning',
  message,
  source: 'lint',
  rowId,
  suggestion,
})

const CONTROL = new Set<MselRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])
const sentences = (text: string): string[] => text.split(/(?<=[.!?;])\s+|\n/)
const clip = (s: string): string => (s.length > 80 ? `${s.slice(0, 77)}…` : s)

// ---- outside agencies decide ----------------------------------------------------------------

/** Outside agencies and regulators that advise, assist and receive reports. */
const AGENCY = String.raw`(?:CISA|FBI|TSA|DHS|FAA|FEMA|EPA|PHMSA|NTSB|OSHA|NRC|USCG|Coast Guard|Secret Service|Secretary of State|state police|state regulator|regulators?|(?:the )?state (?:EOC|emergency management)|PUC|public utilit(?:y|ies) commission)`
/** What only the exercising organization decides: closing the incident, restoring, restarting. */
const RESUME = String.raw`(?:restor\w*|restart\w*|resum\w*|return(?:ing)? to (?:service|normal|operations)|reopen\w*|re-?energi[sz]\w*|recovery)`
const DECIDES = String.raw`(?:clos(?:e|es|ed|ing) (?:the |this |our )?(?:incident|event)|declar\w* (?:the )?(?:incident|event) (?:closed|over|resolved)|(?:gives?|gave|giving) (?:the )?all[- ]clear|(?:approv|authori[sz]|clear|sign\w* off on)\w* (?:the |a |full )?(?:system |network |plant |site )?${RESUME})`
const AGENCY_DECIDES = [
  new RegExp(String.raw`\b(${AGENCY})\b(?:'s)?([^.!?;\n]{0,80}?)\b${DECIDES}`, 'i'),
  new RegExp(
    String.raw`\b${RESUME}\b([^.!?;\n]{0,60}?)\b(?:approved|authori[sz]ed|cleared|signed off) by (?:the )?(${AGENCY})\b`,
    'i',
  ),
  new RegExp(
    String.raw`\b(${AGENCY})(?:'s)? (?:approval|sign-?off|clearance|authori[sz]ation)\b([^.!?;\n]{0,40}?)\b${RESUME}`,
    'i',
  ),
  new RegExp(
    String.raw`\b${RESUME}\b([^.!?;\n]{0,40}?)\b(${AGENCY})(?:'s)? (?:approval|sign-?off|clearance|authori[sz]ation)\b`,
    'i',
  ),
]
const NEGATION = /\b(?:no|not|never|without|neither|nor|nobody|none)\b|n't\b/i

/** The first sentence where an outside agency closes the incident or approves the restore. */
function agencyDecision(text: string): { agency: string; quote: string } | undefined {
  for (const sentence of sentences(text)) {
    for (const re of AGENCY_DECIDES) {
      const m = re.exec(sentence)
      if (!m) continue
      // "No regulator approves the restart", "no access is restored until …": not a decision.
      if (NEGATION.test(sentence)) continue
      const agency = new RegExp(String.raw`\b${AGENCY}\b`, 'i').exec(m[0])?.[0]
      return { agency: agency ?? 'an outside agency', quote: m[0] }
    }
  }
  return undefined
}

function lintAgencyDecisions(s: Scenario): W[] {
  return s.msel.flatMap((row): W[] => {
    const hit = agencyDecision(`${row.event}\n${row.expectedAction}`)
    if (!hit) return []
    return [
      warn(
        OUTSIDE_AGENCY_DECIDES,
        `Row ${row.id} has ${hit.agency} deciding for the organization ("${clip(hit.quote)}")`,
        row.id,
        `${hit.agency} advises, assists and receives reports; the organization's own incident commander closes the incident and approves restoration`,
      ),
    ]
  })
}

// ---- restores that finish in minutes ---------------------------------------------------------

/** What breaks a system so a full restore takes hours: encryption, wiping, a confirmed compromise. */
const BROKEN =
  /\b(?:encrypt(?:ed|ion|s)?|ransomware|ransom note|wiped|wiper|(?:is|are|was|were|been) compromised)\b/i
const RESTORED =
  /\b(?:fully restored|full(?:y)? restor(?:ed|ation) (?:is |was )?complete|restor(?:e|ation) (?:is |was |has been )?complete(?:d)?|(?:has|have) been (?:fully )?restored|(?:is|are|was|were) (?:now )?(?:fully )?restored|(?:is|are) back (?:online|in service|up and running)|rebuilt and (?:back )?online)\b/i
const RESTORED_WHAT =
  /\b(?:servers?|network|scada|ics|ot|systems?|databases?|domain|active directory|ehr|cad|hmi|plcs?|controllers?|file (?:server|shares?)|shares|backups?|workstations?|endpoints?)\b/i
const NOT_DONE =
  /\b(?:not|never|until|before|once|when|if|will|would|plan(?:s|ned)?|estimate[sd]?|expected|pending|partial(?:ly)?|in progress|being|start(?:s|ed)?|begin(?:s|ning)?|hours?|days?|tomorrow|overnight)\b|n't\b/i
/** A full restore sooner than this after the systems broke is not credible. */
export const MIN_RESTORE_MINUTES = 60

function restoreClaim(text: string): string | undefined {
  return sentences(text).find((x) => RESTORED.test(x) && RESTORED_WHAT.test(x) && !NOT_DONE.test(x))
}

function lintRestorePace(s: Scenario): W[] {
  const broken = s.msel.find((r) => BROKEN.test(r.event))
  if (!broken) return []
  const from = exerciseMinutes(broken.time)
  return s.msel.flatMap((row): W[] => {
    if (CONTROL.has(row.purposeTag) && row.purposeTag !== 'TIME_JUMP') return []
    const elapsed = exerciseMinutes(row.time) - from
    if (elapsed < 0 || elapsed >= MIN_RESTORE_MINUTES) return []
    const claim = restoreClaim(row.event)
    if (!claim) return []
    return [
      warn(
        RESTORE_TOO_FAST,
        `Row ${row.id} reports a full restore ${elapsed} minutes after row ${broken.id} (${clip(claim.trim())})`,
        row.id,
        'Rebuilding encrypted or compromised systems takes hours to days: show it as started, partial or scheduled, with checks before anything returns to service',
      ),
    ]
  })
}

// ---- contact details ---------------------------------------------------------------------------

/** Real federal domains (and their subdomains): a real agency's address is fine to use. */
const FEDERAL = new Set([
  'cisa.gov',
  'fbi.gov',
  'ic3.gov',
  'dhs.gov',
  'tsa.gov',
  'faa.gov',
  'fema.gov',
  'ready.gov',
  'epa.gov',
  'nrc.gov',
  'weather.gov',
  'noaa.gov',
  'cdc.gov',
  'hhs.gov',
  'usa.gov',
  'dot.gov',
  'energy.gov',
  'osha.gov',
  'dol.gov',
  'fcc.gov',
  'ntsb.gov',
  'eac.gov',
  'justice.gov',
  'nist.gov',
  'secretservice.gov',
  'uscg.mil',
])
const STATES =
  'al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|newhampshire|newjersey|newmexico|newyork|northcarolina|northdakota|ohio|oklahoma|oregon|pennsylvania|rhodeisland|southcarolina|southdakota|tennessee|texas|utah|vermont|virginia|washington|westvirginia|wisconsin|wyoming'
/** A state government domain: ohio.gov, epa.ohio.gov, kdhe.ks.gov, state.oh.us. */
const STATE_GOV = new RegExp(`(?:^|\\.)(?:${STATES})\\.gov$|\\.state\\.[a-z]{2}\\.us$`)
/** Public mail and hosting services an attacker or a resident really uses. */
const PUBLIC_SERVICES = new Set([
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'proton.me',
  'protonmail.com',
  'icloud.com',
  'aol.com',
])
/** Reserved for documentation (RFC 2606 / 6761): never someone's real address. */
const RESERVED = /(?:^|\.)(?:example|test|invalid|localhost)$|^example\.(?:com|net|org)$/

const TLD = 'com|net|org|gov|edu|mil|us|io|co|info|biz|news|tv|media|online|site'
const DOMAIN = new RegExp(
  String.raw`(?<![\w@.-])(?:[\w.+-]+@)?((?:[a-z0-9-]+\.)+(?:${TLD}))(?![\w-])`,
  'gi',
)

/** Whether a domain may appear in an inject: reserved, a real agency's or a public service. */
export function allowedDomain(domain: string): boolean {
  const d = domain.toLowerCase()
  if (RESERVED.test(d) || PUBLIC_SERVICES.has(d) || STATE_GOV.test(d)) return true
  return [...FEDERAL].some((f) => d === f || d.endsWith(`.${f}`))
}

/** 555 numbers outside 555-0100–0199, and geographic numbers with a real-looking exchange. */
const PHONE = /(?<![\d-])(?:\(?([2-9]\d{2})\)?[-.\s]{1,2})?(\d{3})[-.\s](\d{4})(?![\d-])/g
const TOLL_FREE = new Set(['800', '833', '844', '855', '866', '877', '888'])

export function realLookingPhones(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(PHONE)) {
    const [, area, exchange, line] = m
    if (exchange === '555') {
      if (!/^01\d\d$/.test(line!)) out.push(m[0].trim())
    } else if (area && !TOLL_FREE.has(area) && /^[2-9]/.test(exchange!)) out.push(m[0].trim())
  }
  return out
}

export function realLookingDomains(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(DOMAIN)) if (!allowedDomain(m[1]!)) out.add(m[0])
  return [...out]
}

/** The exercise domain the brief names ("uses the exercise domain corwinvalleygas.example"). */
export function exerciseDomain(s: Scenario): string | undefined {
  const text = (s.brief?.constraints ?? []).join('\n')
  return /\bexercise domain\s+([a-z0-9.-]+\.[a-z]+)/i.exec(text)?.[1]
}

function lintContacts(s: Scenario): W[] {
  const own = exerciseDomain(s)
  return s.msel.flatMap((row): W[] => {
    const text = [row.event, row.expectedAction, row.from, row.toLabel ?? ''].join('\n')
    const found = [...realLookingDomains(text), ...realLookingPhones(text)]
    if (!found.length) return []
    return [
      warn(
        CONTACT_REAL_LOOKING,
        `Row ${row.id} has contact details that may belong to someone real: ${found.join(', ')}`,
        row.id,
        `Use ${own ? `the exercise domain ${own}` : 'a .example domain'} for the organization and fictional .example domains for outside parties (a real agency's own domain is fine), and 555-0100 to 555-0199 for phone numbers`,
      ),
    ]
  })
}

/** Every realism lint. */
export function lintRealism(s: Scenario): LintWarning[] {
  return [...lintAgencyDecisions(s), ...lintRestorePace(s), ...lintContacts(s)]
}
