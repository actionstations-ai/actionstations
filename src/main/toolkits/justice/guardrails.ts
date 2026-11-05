// Level of detail rule for the justice field (spec 0465 FR-7, ADR-0130): Action Stations
// exercises command, coordination and decisions. It never teaches tactics, so generated text
// stays at the level of units, building-level locations and statuses. These are pure checks
// over text; `register-lint.ts` wraps them as field lint rules, and the toolkit and domain
// carry the same rule as a generation-time fragment. A blocklist can catch legitimate
// after-action words, so every hit is a warning that names the phrase, and a reviewer can widen
// the allowlist (GUARDRAIL_ALLOWED) without touching the patterns.

export type GuardrailScope = 'all' | 'public' | 'negotiation'

export type GuardrailCategoryId =
  | 'entry_methods'
  | 'weapons_handling'
  | 'tactical_positioning'
  | 'force_options'
  | 'defeating_security'
  | 'attack_planning'
  | 'facility_detail'
  | 'position_in_building'
  | 'notoriety'
  | 'negotiation_technique'

interface GuardrailCategory {
  id: GuardrailCategoryId
  scope: GuardrailScope
  /** What the writer should do instead; shown after the phrase. */
  instead: string
  patterns: readonly RegExp[]
}

const CATEGORIES: readonly GuardrailCategory[] = [
  {
    id: 'entry_methods',
    scope: 'all',
    instead: 'say who decided and who was told, not how a door or room is entered',
    patterns: [
      /\bbreach(?:ing|ed)? (?:the |a )?(?:door|wall|window|cell|entry|gate)/i,
      /\b(?:dynamic|forced|explosive|mechanical) (?:entry|breach)/i,
      /\b(?:battering|door) ram\b/i,
      /\bkick(?:ing|ed)? in (?:the |a )?door/i,
      /\bflash[- ]?bangs?\b|\bstun grenades?\b|\bdistraction devices?\b/i,
      /\b(?:stack(?:ed|ing)?|stacks) (?:up )?(?:on|at) (?:the )?(?:door|entry)/i,
    ],
  },
  {
    id: 'weapons_handling',
    scope: 'all',
    instead: 'name the incident type and the count of people affected, not the weapon',
    patterns: [
      /\b(?:round|rounds) (?:chambered|loaded)\b|\bchamber(?:ed|ing) a round\b/i,
      /\bmagazines? (?:capacity|change|swap|reload)\b|\b\d{1,3}[- ]round magazines?\b/i,
      /\b\.\d{2,3} calibers?\b|\bcalibers?\b|\b\d{1,2} ?mm (?:pistol|rifle|handgun)\b/i,
      /\bsuppressors?\b|\bselector switch\b|\brate of fire\b/i,
      /\bhow to (?:load|fire|aim|build|assemble) /i,
      /\bAR-15\b|\bAK-47\b/,
    ],
  },
  {
    id: 'tactical_positioning',
    scope: 'all',
    instead: 'give units, staging areas and building-level locations only',
    patterns: [
      /\bsnipers? (?:is |are |was |were )?(?:positioned|set up|in position|on the)\b/i,
      /\boverwatch\b/i,
      /\broom[- ]clearing\b|\bclear(?:ing|ed)? (?:each|every|the) rooms?\b|\bslice the pie\b|\bfatal funnel\b/i,
      /\b(?:fields? of fire|cover and concealment|angles? of approach|lines? of fire)\b/i,
      /\b(?:two|three|four|\d)[- ](?:man|officer|person) (?:stack|entry|team) (?:enters|moves|breaches)/i,
      /\btake (?:up )?(?:a )?(?:firing )?position at (?:the )?\w+ (?:corner|window|door|stairwell)/i,
    ],
  },
  {
    id: 'force_options',
    scope: 'all',
    instead: 'record the command decision and who approved it, not the force option',
    patterns: [
      /\bauthoriz\w+ (?:to use )?(?:deadly|lethal) force\b|\bdeadly force (?:is |was )?authorized\b/i,
      /\b(?:deploy(?:ing|ed)?|use of) (?:tasers?|conducted energy|pepper (?:ball|spray)|less[- ]lethal (?:rounds?|munitions?)|chemical agents?|gas)\b/i,
      /\btaser (?:deploy|setting|cartridge)/i,
      /\b(?:control holds?|takedown techniques?|pain compliance)\b/i,
    ],
  },
  {
    id: 'defeating_security',
    scope: 'all',
    instead: 'describe the effect on operations, not how a security or detention measure fails',
    patterns: [
      /\bdefeat(?:ing|ed)? (?:the |a )?(?:lock|restraints?|handcuffs?|door|cameras?|alarm|sally ?port|access control)/i,
      /\bbypass(?:ing|ed)? (?:the |a )?(?:lock|door controls?|control room|cameras?|alarm|badge reader|sally ?port|metal detector|screening)/i,
      /\bdisabl(?:e|ing|ed) (?:the |a )?(?:cameras?|alarms?|door controls?|locks?|radio)/i,
      /\bpick(?:ing|ed)? (?:the |a )?(?:lock|cuffs?)\b|\bshimm?(?:ing|ed)?\b/i,
      /\b(?:escape|exit) (?:routes?|methods?|plans?) (?:from|out of|for) (?:the )?(?:jail|facility|housing|cell)/i,
      /\bsmuggl(?:e|ing|ed) (?:a |the )?(?:weapons?|contraband|phones?|drugs?) (?:in|into|past)\b/i,
      /\bblind spots?\b|\bunmonitored (?:door|entrance|gate|area|corridor)s?\b|\bunlocked (?:door|gate)s?\b/i,
    ],
  },
  {
    id: 'attack_planning',
    scope: 'all',
    instead: 'write the response and the decisions it forces, not how the attack was planned',
    patterns: [
      /\battack plans?\b|\bplann(?:ed|ing) (?:the |an |a )?(?:attack|shooting|ambush)\b/i,
      /\btarget selection\b|\bmaximi[sz]e (?:the )?(?:casualties|body count|damage)\b/i,
      /\bbest (?:time|place) to (?:attack|strike|hit)\b|\bhow to (?:attack|ambush|shoot)\b/i,
      /\bambush(?:es|ed)? (?:the )?(?:responding|officers|deputies|police)\b/i,
      /\bbooby[- ]?traps?\b|\bbomb[- ]making\b|\bIED (?:placement|construction)\b/i,
      /\bsecondary (?:device|explosive)s? (?:placed|timed)/i,
    ],
  },
  {
    id: 'facility_detail',
    scope: 'all',
    instead:
      'use a building-level location; floor plans and security weaknesses are not exercise content',
    patterns: [
      /\bfloor ?plans?\b|\bblueprints?\b|\bbuilding schematics?\b/i,
      /\bsecurity (?:weakness(?:es)?|gaps?|vulnerabilit(?:y|ies)) (?:at|in|of) (?:the )?(?:jail|prison|courthouse|facility|school|building)/i,
      /\b(?:guard|officer|deputy) rotation (?:schedule|gaps?)\b/i,
    ],
  },
  {
    id: 'position_in_building',
    scope: 'all',
    instead:
      'report the incident at building level (for example "the north building"), not where inside it',
    patterns: [
      /\b(?:suspects?|shooters?|gunmen|gunman|assailants?|perpetrators?|subjects?)\b[^.\n]{0,60}\b(?:room \d+|rm\.? \d+|(?:first|second|third|fourth|1st|2nd|3rd|4th|upper|lower|top) floor|stairwells?|corridors?|hallways?|classrooms?|cafeteria|gym(?:nasium)?|restrooms?|bathrooms?)\b/i,
    ],
  },
  {
    id: 'notoriety',
    scope: 'public',
    instead:
      'public messages do not name or describe the person responsible; refer to "the individual"',
    patterns: [
      /\b(?:[Ss]hooter|[Gg]unman|[Aa]ssailant|[Aa]ttacker|[Pp]erpetrator|[Ss]uspect|[Oo]ffender)\b[^.\n]{0,40}?\b(?:identified as|named|known as|is|was)\s+(?:Mr\.|Ms\.|Dr\.)?\s*[A-Z][a-z]+\s+[A-Z][a-z]+/,
      /\bmanifesto\b|\bmastermind\b|\binfamous\b|\bbody count\b|\bkill count\b/i,
      /\blivestream(?:ed|ing)? (?:of )?the (?:attack|shooting|incident)/i,
    ],
  },
  {
    id: 'negotiation_technique',
    scope: 'negotiation',
    instead:
      'log contact times, decision requests and welfare at the level of "agreed to speak"; no technique or dialogue',
    patterns: [
      /\b(?:active listening|emotion(?:al)? labell?ing|mirroring|paraphras\w+|minimal encouragers?|open[- ]ended questions?|calibrated questions?|empathy statements?|use of silence)\b/i,
      /\b(?:build(?:ing)? rapport|rapport[- ]building|behavioral change stairway|stall(?:ing)? tactics?|buy(?:ing)? time by|deceiv\w+|ruse)\b/i,
      /^\s*(?:negotiator|primary|secondary|coach|subject|NEG)\s*:/im,
    ],
  },
]

/** Phrases a reviewer has cleared as ordinary after-action vocabulary. Matched whole, ignoring case. */
export const GUARDRAIL_ALLOWED: readonly string[] = []

export interface GuardrailHit {
  category: GuardrailCategoryId
  /** The phrase that matched. */
  match: string
  message: string
}

const allowed = (m: string): boolean =>
  GUARDRAIL_ALLOWED.some((a) => a.toLowerCase() === m.trim().toLowerCase())

/** Hits for `text` in the categories whose scope is in `scopes` ('all' is always included). */
export function guardrailHits(
  text: string,
  scopes: ReadonlySet<GuardrailScope> = new Set(['all']),
): GuardrailHit[] {
  const out: GuardrailHit[] = []
  for (const c of CATEGORIES) {
    if (c.scope !== 'all' && !scopes.has(c.scope)) continue
    for (const p of c.patterns) {
      const m = p.exec(text)
      if (!m || allowed(m[0])) continue
      out.push({
        category: c.id,
        match: m[0].trim(),
        message: `"${m[0].trim()}" is tactical or security detail; ${c.instead}.`,
      })
      break
    }
  }
  return out
}

/** Every category id, for tests and documentation. */
export const GUARDRAIL_CATEGORY_IDS: readonly GuardrailCategoryId[] = CATEGORIES.map((c) => c.id)

// ---- where the checks apply -----------------------------------------------------------------

/** The templates the justice toolkit adds; all their text is checked. */
export const JUSTICE_OWN_TYPES = [
  'justice_command_briefing',
  'justice_family_notice',
  'justice_negotiation_log',
  'justice_amber_worksheet',
  'justice_count_sheet',
  'justice_corrections_report',
  'justice_court_order',
  'justice_court_notice',
  'justice_evidence_log',
] as const

/** Shared types a justice scenario also uses; checked only when the text is about law enforcement. */
export const JUSTICE_SHARED_TYPES = [
  'cad_incident_detail',
  'cad_radio_traffic',
  'radio_call',
  '911_cad_entry',
  'mutual_aid_request',
  'ics_213_general_message',
  'ics_214_activity_log',
  'press_release',
  'tweet',
  'facebook_post',
  'news_article',
  'media_inquiry_phone_slip',
  'sitrep',
  'email',
  'memo',
  'official_letter',
  'text_message',
] as const

/** Types read by the public: the no-notoriety rule applies to them. */
export const JUSTICE_PUBLIC_TYPES = [
  'justice_family_notice',
  'justice_court_notice',
  'press_release',
  'tweet',
  'facebook_post',
  'news_article',
] as const

export const JUSTICE_NEGOTIATION_TYPES = ['justice_negotiation_log'] as const

/** Text about law enforcement, corrections or courts; the checks read nothing else, so other domains' injects of the same types are left alone. */
const JUSTICE_CONTEXT =
  /\b(?:police|sheriff|deputy|deputies|officers?|swat|jail|inmates?|detention|corrections|courthouse|courtroom|judge|clerk of court|prosecutor|public defender|docket|incident commander|command post|negotiat\w*|suspect|shooter|gunman|assailant)\b/i

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Every string in `value`, depth first, skipping `figures` (drawn data, checked by its own kind). */
export function fieldStrings(value: unknown, out: string[] = [], key = ''): string[] {
  if (key === 'figures') return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) fieldStrings(v, out)
  else if (isRecord(value)) for (const [k, v] of Object.entries(value)) fieldStrings(v, out, k)
  return out
}

/** Hits for one inject's fields, in the given scopes; nothing when the text is not about justice. */
export function guardrailHitsForFields(
  fields: Record<string, unknown>,
  scopes: ReadonlySet<GuardrailScope> = new Set(['all']),
): GuardrailHit[] {
  const text = fieldStrings(fields).join('\n')
  return JUSTICE_CONTEXT.test(text) ? guardrailHits(text, scopes) : []
}
