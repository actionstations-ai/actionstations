// Content lints for realism defects the prompts alone did not prevent (#347): an outside agency
// that closes the incident or approves the restoration (federal and state partners advise,
// assist and receive reports; the exercising organization decides), a full restore of
// encrypted servers or a control network within the hour, and contact details that look real
// (an email or web domain that is not a reserved .example one, a 555 number outside
// 555-0100–0199, a geographic phone number). Pure; lint.ts adds them to lintScenario.
import {
  exerciseMinutes,
  type HazardSnapshot,
  type LintWarning,
  type MselRow,
  type Scenario,
} from '@shared/schemas'

export const OUTSIDE_AGENCY_DECIDES = 'OUTSIDE_AGENCY_DECIDES'
export const RESTORE_TOO_FAST = 'RESTORE_TOO_FAST'
export const CONTACT_REAL_LOOKING = 'CONTACT_REAL_LOOKING'
export const HAZARD_AS_CURRENT = 'HAZARD_AS_CURRENT'

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
const AGENCY = String.raw`(?:CISA|FBI|TSA|DHS|FAA|FSDO|FEMA|EPA|PHMSA|NTSB|OSHA|NRC|USCG|Coast Guard|Captain of the Port|Secret Service|Secretary of State|state police|state regulator|regulators?|(?:the )?state (?:EOC|emergency management)|PUC|public utilit(?:y|ies) commission|FERC|NERC|FCC|CSB|Chemical Safety Board|DDAGW|primacy agency|(?:the )?state (?:drinking[- ]water|health|public health|environmental|education|dam safety) (?:office|program|department|agency|division|board)|(?:the )?state department of (?:health|education|environmental \w+)|Department of Education)`
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
/**
 * An outside agency forbidding, ordering or taking over (#364 item 3): "the FBI forbids return
 * to service", "DDAGW orders the city to issue the advisory", "Ohio EPA: you must issue a boil
 * order within 30 minutes", "the FBI is taking jurisdiction". The organization decides.
 */
const SUBJECT = String.raw`(?:you|us|them|the (?:[\w'’&-]+ ){0,3}(?:city|utility|county|district|group|company|airport|plant|operators?|organi[sz]ation|team|players?|commander|staff|crews?|department|authority|port|airline|hospital|school|board|agency|pilots?|fleet))`
/** Response steps the organization owns: an order to take one is a decision made for it. */
const STEP = String.raw`(?:issue|shut|close|stop|ground|evacuate|keep|stay|remain|stand down|cease|halt|suspend|isolate|disconnect|restart|restore|resume|return|reopen|lift|declare|activate|flush|pay|cancel|delay)\b`
const MUST = String.raw`(?:must|shall|(?:are|is) (?:required|ordered|directed|to)(?: to)?)`
const TAKES_OVER = String.raw`(?:command|control|charge|jurisdiction)\b(?! (?:of|over) (?:the |this )?(?:criminal |federal )?(?:investigation|case|evidence|crime|scene))`
const ORDERS = String.raw`(?:(?:forbid|prohibit|bar|block|ban)\w* (?:the |any |a |all |further )?(?:system |network |plant |site |fleet |flight )?(?:${RESUME}|flights?|operations)|(?:order|direct|requir|instruct|mandat|tell|told|compel)\w* ${SUBJECT} to (?:now |immediately )?${STEP}|(?:tak\w*|took|assum\w*) (?:over )?(?:incident )?${TAKES_OVER})`
const MUST_STEP = String.raw`${SUBJECT} ${MUST} (?:now |immediately )?${STEP}`
const AGENCY_ORDERS = [
  new RegExp(String.raw`\b(${AGENCY})\b(?:'s)?([^.!?;\n]{0,80}?)\b${ORDERS}`, 'i'),
  new RegExp(String.raw`\b(${AGENCY})\b(?:'s)?([^.!?;\n]{0,80}?)\b${MUST_STEP}`, 'i'),
]
/** "No return to service until the FBI issues a release": a gate the agency holds. */
const GATE_VERB = String.raw`(?:(?:issu|giv)\w* (?:a |an |the |its |you |us )?(?:formal |written |final )?(?:release|clearance|approval|authori[sz]ation|permission|go-ahead|ok|okay|green light|all[- ]clear)|approv\w*|releas\w* (?:the |it\b|them\b)|clear\w* (?:the |it\b|them\b)|sign\w* off|authori[sz]\w*|lift\w*|permit\w*)`
const AGENCY_GATES = [
  new RegExp(
    String.raw`\b${RESUME}\b([^.!?;\n]{0,60}?)\b(?:until|unless|without)\b (?:the )?(${AGENCY})\b(?:'s)?([^.!?;\n]{0,30}?)\b${GATE_VERB}`,
    'i',
  ),
  new RegExp(
    String.raw`\b${RESUME}\b([^.!?;\n]{0,60}?)\bonly (?:after|once|when|if) (?:the )?(${AGENCY})\b(?:'s)?([^.!?;\n]{0,30}?)\b${GATE_VERB}`,
    'i',
  ),
]
/** An order with the agency named just before it, in the row's source or a short lead sentence. */
const BARE_ORDERS = [
  new RegExp(String.raw`\b${ORDERS}`, 'i'),
  new RegExp(String.raw`\b${MUST_STEP}`, 'i'),
]
/** A reporting duty the law gives the agency is not an order about the response. */
const REPORTING = /\b(?:report\w*|notif\w*|submit\w*|file|filing)\b/i
const NEGATION = /\b(?:no|not|never|without|neither|nor|nobody|none)\b|n't\b/i
/** Notice names that carry a "not": "Do Not Drink", "Do Not Use". */
const NOTICE_NAME = /\bdo not (?:drink|use|consume|boil)\b/gi
/** Advice is not an order: "CISA recommends", "DDAGW suggests you should". */
const ADVISORY =
  /\b(?:recommend\w*|advis(?:e|es|ed|ing)|suggest\w*|request\w*|ask\w*|urg(?:e|es|ed|ing)|encourag\w*|may|might|could|should|consider\w*|guidance|offer\w*|please)\b/i
const AGENCY_RE = new RegExp(String.raw`\b${AGENCY}\b`, 'i')

interface AgencyHit {
  agency: string
  quote: string
}

/** The first sentence where an outside agency closes the incident, orders a step or approves the restore. */
function agencyDecision(text: string, from = ''): AgencyHit | undefined {
  const hit = (m: RegExpExecArray, agency?: string): AgencyHit => ({
    agency: agency ?? AGENCY_RE.exec(m[0])?.[0] ?? 'an outside agency',
    quote: m[0],
  })
  let speaker = AGENCY_RE.exec(from)?.[0]
  for (const sentence of sentences(text)) {
    const plain = sentence.replace(NOTICE_NAME, 'notice')
    // The gate carries its own negation ("no restart until the FBI releases the site").
    for (const re of AGENCY_GATES) {
      const m = re.exec(plain)
      if (m && !ADVISORY.test(plain)) return hit(m)
    }
    // "No regulator approves the restart", "no access is restored until …": not a decision.
    const negated = NEGATION.test(plain)
    const advisory = ADVISORY.test(plain) || REPORTING.test(plain)
    for (const re of negated ? [] : AGENCY_DECIDES) {
      const m = re.exec(plain)
      if (m) return hit(m)
    }
    for (const re of negated || advisory ? [] : AGENCY_ORDERS) {
      const m = re.exec(plain)
      if (m) return hit(m)
    }
    // "DDAGW here. You must issue …": the speaker is the agency.
    for (const re of negated || advisory || !speaker ? [] : BARE_ORDERS) {
      const m = re.exec(plain)
      if (m) return hit(m, speaker)
    }
    const lead = plain.split(/\s+/).length <= 6 ? AGENCY_RE.exec(plain)?.[0] : undefined
    speaker = lead ?? AGENCY_RE.exec(from)?.[0]
  }
  return undefined
}

function lintAgencyDecisions(s: Scenario): W[] {
  return s.msel.flatMap((row): W[] => {
    // The row's source speaks the event; the expected action is the players' own.
    const hit = agencyDecision(row.event, row.from) ?? agencyDecision(row.expectedAction)
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

// ---- hazard snapshot values shown as current (#439 FR-20) ------------------------------------

/** A snapshot older than this, relative to the exercise date, no longer describes "now". */
export const HAZARD_STALE_DAYS = 30
const escapeRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** What a row could quote from the snapshot: [label, pattern]. */
function hazardNeedles(snap: HazardSnapshot): [string, RegExp][] {
  const out: [string, RegExp][] = []
  for (const a of snap.alerts)
    if (a.headline.length >= 20)
      out.push([`the alert "${clip(a.headline)}"`, new RegExp(escapeRe(a.headline), 'i')])
  for (const q of [...snap.earthquakes.recent, ...snap.earthquakes.historical])
    out.push([
      `magnitude ${q.mag}`,
      new RegExp(String.raw`\b(?:M\s?|magnitude\s+)${escapeRe(String(q.mag))}\b`, 'i'),
    ])
  for (const d of snap.declarations)
    if (d.disasterNumber >= 1000)
      out.push([
        `declaration ${d.disasterNumber}`,
        new RegExp(String.raw`\b(?:DR|EM|FM)?-?${d.disasterNumber}\b`),
      ])
  return out
}

/**
 * Warn when a row repeats a value from the hazard snapshot as if it were current, in an
 * exercise dated more than 30 days after the snapshot. Pure; the engine passes the snapshot.
 */
export function lintHazardCurrency(s: Scenario, snap: HazardSnapshot | undefined): LintWarning[] {
  const start = s.brief.startDate
  if (!snap || !start) return []
  const days = (Date.parse(start) - Date.parse(snap.fetchedAt)) / 86_400_000
  if (!(days > HAZARD_STALE_DAYS)) return []
  const needles = hazardNeedles(snap)
  const out: W[] = []
  for (const row of s.msel) {
    if (CONTROL.has(row.purposeTag)) continue
    const hit = needles.find(([, re]) => re.test(row.event))
    if (!hit) continue
    out.push(
      warn(
        HAZARD_AS_CURRENT,
        `Row ${row.id} gives ${hit[0]} from the hazard snapshot of ${snap.fetchedAt.slice(0, 10)} as if it were current, but the exercise is set ${Math.round(days)} days later.`,
        row.id,
        'Describe a kind of hazard that fits the place instead of copying a dated alert, magnitude or declaration number.',
      ),
    )
  }
  return out
}
