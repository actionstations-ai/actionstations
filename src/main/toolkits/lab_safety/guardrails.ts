// Content guardrails for the lab safety toolkit (spec 0466 FR-4, ADR-0135). Exercises in this
// field are about what an organization decides and whom it tells. Nothing generated or bundled
// may carry technique, growth, production, enhancement or modification detail for any agent, a
// quantity, a strain, or an agent-specific procedure. The checks are plain, documented text
// rules: a rule set a biosafety officer can read, test and tighten, applied after generation
// (as a field lint rule, so a failing inject goes back for a repair round) and to pack content
// when a toolkit that names the rule is loaded.
//
// Rejected text is never logged beyond its category (spec 0466 Security and privacy).

export const GUARDRAIL_CATEGORIES = [
  'growth_or_production',
  'modification',
  'dissemination',
  'quantity',
  'strain',
  'inactivation_parameters',
  'protocol_detail',
  'agent_not_reviewed',
] as const
export type GuardrailCategory = (typeof GUARDRAIL_CATEGORIES)[number]

export interface GuardrailIssue {
  category: GuardrailCategory
  /** One sentence the repair round sends back to the model; it never repeats the matched text. */
  message: string
}

interface DenyRule {
  category: GuardrailCategory
  message: string
  patterns: readonly RegExp[]
}

const BIO = String.raw`(?:viruses|virus|bacteri\w*|pathogens?|agents?|toxins?|spores?|strains?|isolates?|microbes?|organisms?)`

const FILLER = String.raw`(?:(?:the|a|an|this|that|these|those|more|additional|large|larger|of|in|on|from|your|their|its|viable|live|infectious|pure|quantities|amounts)\W+){0,3}`
const AUX = String.raw`(?:(?:is|are|was|were|be|been|being|can|could|may|to|will|has|have|had|got|get)\W+){0,2}`

/** The deny list: content categories that stay out of every lab exercise product. */
export const DENY_RULES: readonly DenyRule[] = [
  {
    category: 'growth_or_production',
    message:
      'Remove any detail on how to grow, culture, produce, purify or scale up an agent; describe only what the organization decides and whom it tells.',
    patterns: [
      new RegExp(
        String.raw`\b(?:cultur(?:e|ed|ing)|grow(?:n|ing)?|propagat\w*|amplif\w*|cultivat\w*|manufactur\w*|synthesi[sz]\w*|purif\w*|scal(?:e|ing)[- ]up|produc(?:e|ed|ing|tion))\b\W+${FILLER}${BIO}\b`,
        'i',
      ),
      new RegExp(
        String.raw`\b${BIO}\b\W+${AUX}(?:cultured|grown|propagated|amplified|cultivated|manufactured|synthesi[sz]ed|purified|produced)\b`,
        'i',
      ),
      /\b(?:how to|steps? (?:to|for)|instructions? (?:for|to)|recipe for|protocol for|procedure for)\b[^.]{0,40}\b(?:culture|grow|aerosoli[sz]e|disseminate|engineer|enhance|weaponi[sz]e)\b/i,
    ],
  },
  {
    category: 'modification',
    message:
      'Remove any detail on enhancing or modifying an agent (gain of function, transmissibility, virulence, immune or treatment evasion, engineered resistance).',
    patterns: [
      /\bgain[- ]of[- ]function\b/i,
      new RegExp(
        String.raw`\b(?:enhanc\w*|increas\w*|boost\w*|amplif\w*)\b\W+(?:\w+\W+){0,3}?(?:transmissib\w*|virulen\w*|pathogenic\w*|lethal\w*|infectivity|infectiousness)\b`,
        'i',
      ),
      new RegExp(
        String.raw`\b(?:engineer\w*|modif\w*|alter\w*|edit\w*)\b\W+${FILLER}${BIO}\b`,
        'i',
      ),
      /\b(?:evad\w*|escap\w*|resistan\w*)\b\W+(?:\w+\W+){0,3}?(?:vaccines?|immun\w*|antibiotics?|antivirals?|treatments?|detection)\b[^.]{0,40}\b(?:engineer\w*|design\w*|introduc\w*)\b/i,
    ],
  },
  {
    category: 'dissemination',
    message:
      'Remove any detail on spreading an agent on purpose (aerosolizing, dispersing, weaponizing); an accidental release is described by what staff and officials decide.',
    patterns: [
      /\baerosoli[sz](?:e|ed|es|ing|ation)\b/i,
      /\bweaponi[sz]\w*/i,
      /\b(?:dissemination|dispersal|dispersion) of (?:the |an? )?(?:agent|pathogen|spores?|toxin|virus|bacteri\w*)\b/i,
      /\bdisseminat(?:e|ed|ing) (?:the |an? )?(?:agent|pathogen|spores?|toxin|virus|bacteri\w*)\b/i,
    ],
  },
  {
    category: 'quantity',
    message:
      'Remove agent quantities, doses and concentrations (CFU, PFU, TCID50, LD50, copies, cells per volume).',
    patterns: [
      /\b\d[\d,.]*\s*(?:x|×)?\s*(?:10\s*\^\s*\d+)?\s*(?:CFU|PFU|TCID50|LD50|ID50|FFU|MOI|virions?|viral particles|genome copies|copies\/m?L|spores)\b/i,
      /\b10\s*\^\s*\d+\s*(?:CFU|PFU|TCID50|cells|organisms|particles|copies)\b/i,
      /\b\d[\d,.]*\s*(?:cells|organisms|bacteria|particles)\s*(?:\/|per)\s*(?:m[Ll]|[µu]?[Ll]|milliliter|liter)\b/i,
      /\b\d[\d,.]*\s*(?:mg|µg|ug|ng|g)\s*(?:\/|per)\s*kg\b/i,
    ],
  },
  {
    category: 'strain',
    message:
      'Remove strain, isolate or clone designations; name the agent only as a generic class or from the reviewed list.',
    patterns: [
      /\bstrain\s+(?:[A-Z][A-Za-z0-9-]*\d[A-Za-z0-9-]*|[A-Z]{2,}[A-Za-z0-9-]*|K-?12|Ames|Vollum|Zaire)\b/,
      /\b(?:Ames|Vollum|Kikwit|Makona|Sterne)\s+(?:strain|isolate)\b/i,
      /\b(?:isolate|clone)\s+[A-Z0-9][A-Za-z0-9.-]*\d\b/,
    ],
  },
  {
    category: 'inactivation_parameters',
    message:
      'Remove agent-specific inactivation or decontamination parameters (concentrations, contact times, temperatures); say only that the biosafety officer directs decontamination.',
    patterns: [
      /\b(?:inactivat|decontaminat|disinfect|autoclav|steriliz|steriliz)\w*\b[^.]{0,80}?\b\d+(?:\.\d+)?\s*(?:%|percent|minutes?|mins?|hours?|°\s*[CF]|degrees?|ppm|mg\/L)\b/i,
      /\b\d+(?:\.\d+)?\s*(?:%|percent|minutes?|mins?|°\s*[CF]|degrees?|ppm|mg\/L)\b[^.]{0,80}?\b(?:inactivat|decontaminat|disinfect|autoclav|steriliz)\w*/i,
    ],
  },
  {
    category: 'protocol_detail',
    message:
      'Remove laboratory protocol steps and method detail; the exercise concerns incident management, not how work is done.',
    patterns: [
      /\b(?:inoculat\w*|transfect\w*|lyophili[sz]\w*|titrat(?:e|ed|ion|ing)|plaque assay|serial dilution)\b/i,
      /\bincubat(?:e|ed|ing)\s+(?:at|for|with|overnight)\b/i,
      /\b(?:detailed|full|complete|exact|step[- ]by[- ]step)\s+(?:protocol|method|procedure|recipe|instructions)\b/i,
    ],
  },
]

/**
 * Agents the designer may name, by name only. Each is an organism or virus with public health
 * response guidance written for exposures. Everything else on the watch list below must be
 * written as a generic class ("a select agent", "a Risk Group 3 bacterium"). A biosafety
 * officer reviews this list before release; loosen it only with their approval.
 */
export const REVIEWED_AGENTS: readonly string[] = [
  'Salmonella',
  'norovirus',
  'influenza virus',
  'SARS-CoV-2',
  'Mycobacterium tuberculosis',
  'Neisseria meningitidis',
  'hepatitis B virus',
  'hepatitis C virus',
  'HIV',
  'measles virus',
]

/** Agent names the check recognizes as needing the generic class instead. */
export const WATCHED_AGENTS: readonly string[] = [
  'Bacillus anthracis',
  'anthrax',
  'Yersinia pestis',
  'Francisella tularensis',
  'Brucella',
  'Burkholderia mallei',
  'Burkholderia pseudomallei',
  'Coxiella burnetii',
  'Clostridium botulinum',
  'botulinum neurotoxin',
  'Ebola',
  'ebolavirus',
  'Marburg',
  'Lassa',
  'Nipah',
  'Hendra',
  'variola',
  'smallpox',
  'ricin',
  'abrin',
  'Rift Valley fever',
  'Crimean-Congo',
  'staphylococcal enterotoxin',
  'tetrodotoxin',
  'conotoxin',
  'MERS-CoV',
  'reconstructed 1918',
]

const LAB_CONTEXT =
  /\b(?:laborator\w*|lab|BSL-?\d|biosafety|freezer|vial|inventory|select agent|researcher|investigator|specimen|biosafety cabinet)\b/i

/** A named watch-list agent in lab context that the designer's list does not allow. */
function unreviewedAgents(text: string, allowed: readonly string[]): GuardrailIssue[] {
  if (!LAB_CONTEXT.test(text)) return []
  const ok = new Set(allowed.map((a) => a.toLowerCase()))
  const hit = WATCHED_AGENTS.some((name) => {
    if (ok.has(name.toLowerCase())) return false
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
  })
  return hit
    ? [
        {
          category: 'agent_not_reviewed',
          message:
            'Do not name this agent; write a generic class such as "a select agent", "a Tier 1 select agent" or "a Risk Group 3 bacterium", or an agent from the reviewed list.',
        },
      ]
    : []
}

export interface GuardrailOptions {
  /** Named agents the designer chose from the reviewed list; extends REVIEWED_AGENTS. */
  allowedAgents?: readonly string[]
}

/** The issues in one piece of text; one issue per category at most. */
export function checkGuardrails(text: string, options: GuardrailOptions = {}): GuardrailIssue[] {
  if (!text) return []
  const issues: GuardrailIssue[] = []
  for (const rule of DENY_RULES)
    if (rule.patterns.some((p) => p.test(text)))
      issues.push({ category: rule.category, message: rule.message })
  issues.push(...unreviewedAgents(text, [...REVIEWED_AGENTS, ...(options.allowedAgents ?? [])]))
  return issues
}

/** Every string in a value, with a path, depth-limited so a cyclic value cannot hang the check. */
export function stringsOf(
  v: unknown,
  path: string,
  out: { path: string; text: string }[] = [],
  depth = 0,
): { path: string; text: string }[] {
  if (depth > 12) return out
  if (typeof v === 'string') out.push({ path, text: v })
  else if (Array.isArray(v)) v.forEach((x, i) => stringsOf(x, `${path}[${i}]`, out, depth + 1))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) stringsOf(x, `${path}.${k}`, out, depth + 1)
  return out
}

export interface PathedGuardrailIssue extends GuardrailIssue {
  path: string
}

/** The issues in every string of a value (an inject's fields, a pack file). */
export function guardrailIssuesIn(
  value: unknown,
  root = 'fields',
  options: GuardrailOptions = {},
): PathedGuardrailIssue[] {
  return stringsOf(value, root).flatMap(({ path, text }) =>
    checkGuardrails(text, options).map((i) => ({ ...i, path })),
  )
}

/** The categories found in pack content, for the one-line message when a pack is refused. */
export function guardrailCategoriesIn(value: unknown): GuardrailCategory[] {
  return [...new Set(guardrailIssuesIn(value, 'pack').map((i) => i.category))]
}
