// Format checks for the earth science toolkits (spec 0450 FR-7), named by `lintRules` in the
// toolkit files. Each rule reads text (an inject's fields, a message) and reports what a
// seismologist, volcanologist or warning scientist would catch: magnitude and intensity swapped,
// an alert level paired with an aviation color code it cannot travel with, a watch sent as a wireless alert,
// early warning times the physics cannot give. Pure; no Node imports.

export interface GeoLintIssue {
  rule: string
  message: string
  /** The text that triggered the rule. */
  match: string
}

type Rule = (text: string) => { message: string; match: string }[]

const ROMAN = '(?:I{1,3}|IV|V|VI{1,3}|IX|XI{0,2})'

/** Volcano alert level to its usual aviation color code. */
export const ALERT_COLOR_PAIRS: Readonly<Record<string, string>> = {
  NORMAL: 'GREEN',
  ADVISORY: 'YELLOW',
  WATCH: 'ORANGE',
  WARNING: 'RED',
}

/**
 * The color codes each alert level can travel with. The two scales are set separately (ground
 * hazards and ash hazards to aircraft), so a hazardous eruption with little ash is WARNING with
 * ORANGE, as Mauna Loa was in December 2022. Every other mix is a mistake.
 */
export const ALERT_COLOR_ALLOWED: Readonly<Record<string, readonly string[]>> = {
  NORMAL: ['GREEN'],
  ADVISORY: ['YELLOW'],
  WATCH: ['ORANGE'],
  WARNING: ['RED', 'ORANGE'],
}

/** True when the alert level and color code can be issued together. */
export function alertColorAllowed(level: string, color: string): boolean {
  const allowed = ALERT_COLOR_ALLOWED[level.toUpperCase()]
  return !allowed || allowed.includes(color.toUpperCase())
}

/** What an alert level goes with, in words: "ORANGE", or "RED (or ORANGE when there is little ash)". */
export function alertColorWords(level: string): string {
  const [usual, ...other] = ALERT_COLOR_ALLOWED[level.toUpperCase()] ?? []
  return other.length ? `${usual} (or ${other.join(', ')} when there is little ash)` : `${usual}`
}

/** What a color code goes with, in words. */
function colorLevelWords(color: string): string {
  const levels = Object.entries(ALERT_COLOR_ALLOWED)
    .filter(([, cs]) => cs.includes(color.toUpperCase()))
    .map(([l]) => l)
  return levels.join(' or ')
}

/** S-wave speed in km per second used to bound early warning times. */
const SHEAR_KM_S = 3.5
/** Seconds the system needs after rupture starts before an alert can reach a place. */
const PROCESSING_S = 4

function all(re: RegExp, text: string): RegExpMatchArray[] {
  return [
    ...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')),
  ]
}

const magnitudeIntensityLabels: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  for (const m of all(
    new RegExp(String.raw`\b(?:M|Mw|magnitude)\s+${ROMAN}\b(?![a-z])`, 'g'),
    text,
  ))
    out.push({
      message: 'A magnitude is a decimal number (M 6.8); Roman numerals are intensity (MMI).',
      match: m[0],
    })
  for (const m of all(/\b(?:MMI|intensity(?: of)?)\s+(\d+\.\d+)\b/gi, text))
    out.push({
      message:
        'Modified Mercalli intensity is a Roman numeral (I to XII; USGS maps show I to X+), not a decimal.',
      match: m[0],
    })
  return out
}

const alertLevelColorPair: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  const levels = Object.keys(ALERT_COLOR_PAIRS).join('|')
  const colors = 'GREEN|YELLOW|ORANGE|RED'
  const forward = new RegExp(
    String.raw`\b(${levels})\b[\s/,:()-]{1,4}(?:aviation )?(?:color code )?(?:is |of )?\b(${colors})\b`,
    'gi',
  )
  const backward = new RegExp(
    String.raw`\b(${colors})\b[\s/,:()-]{1,4}(?:alert level |volcano alert level )?(?:is |of )?\b(${levels})\b`,
    'gi',
  )
  for (const m of all(forward, text))
    if (!alertColorAllowed(m[1]!, m[2]!))
      out.push({
        message: `Alert level ${m[1]!.toUpperCase()} pairs with aviation color code ${alertColorWords(m[1]!)}, not ${m[2]!.toUpperCase()}.`,
        match: m[0],
      })
  for (const m of all(backward, text))
    if (!alertColorAllowed(m[2]!, m[1]!))
      out.push({
        message: `Aviation color code ${m[1]!.toUpperCase()} pairs with alert level ${colorLevelWords(m[1]!)}, not ${m[2]!.toUpperCase()}.`,
        match: m[0],
      })
  return out
}

const volcanoNoticeSyntax: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  const vona = /VOLCANO OBSERVATORY NOTICE FOR AVIATION/i.test(text)
  if (!vona && !/VOLCANIC ASH ADVISORY/i.test(text)) return out
  const required = vona
    ? [
        'DTG:',
        'VOLCANO:',
        'PSN:',
        'NOTICE NR:',
        'CURRENT COLOUR CODE:',
        'PREVIOUS COLOUR CODE:',
        'SVO:',
      ]
    : ['DTG:', 'VAAC:', 'VOLCANO:', 'PSN:', 'ADVISORY NR:', 'INFO SOURCE:']
  for (const label of required)
    if (!text.includes(label))
      out.push({ message: `The notice is missing its "${label}" line.`, match: label })
  const stamp = text.match(/DTG:\s*(\S+)/)
  if (stamp && !/^\d{8}\/\d{4}Z$/.test(stamp[1]!))
    out.push({ message: 'The issue time is written YYYYMMDD/HHMMZ in UTC.', match: stamp[0] })
  return out
}

const eewTimingLimits: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  const re =
    /(\d+(?:\.\d+)?)\s*(?:seconds?|s)\s+of\s+(?:warning|notice|lead time)[^.]{0,80}?(\d+(?:\.\d+)?)\s*km|(\d+(?:\.\d+)?)\s*km[^.]{0,80}?(\d+(?:\.\d+)?)\s*(?:seconds?|s)\s+of\s+(?:warning|notice|lead time)/gi
  for (const m of all(re, text)) {
    const warn = Number(m[1] ?? m[4])
    const km = Number(m[2] ?? m[3])
    const ceiling = km / SHEAR_KM_S - PROCESSING_S
    if (km <= 20 && warn > 0)
      out.push({
        message:
          'Places within about 20 km of the epicenter get no warning; the alert can arrive after shaking starts.',
        match: m[0],
      })
    else if (warn > ceiling + 1)
      out.push({
        message: `At ${km} km strong shaking arrives about ${Math.round(km / SHEAR_KM_S)} s after rupture and the alert needs several seconds, so warning is at most about ${Math.max(0, Math.round(ceiling))} s.`,
        match: m[0],
      })
  }
  return out
}

const aftershockProbabilityWording: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  const bad: [RegExp, string][] = [
    [
      /\baftershocks? (?:will|are going to) (?:end|stop|cease)\b/i,
      'Nobody can say when aftershocks will end.',
    ],
    [
      /\b(?:guarantee[sd]?|certain(?:ly)?) (?:that )?(?:no|a)\b[^.]{0,40}\b(?:larger|bigger|aftershock|earthquake)/i,
      'Aftershock chances are probabilities, never guarantees.',
    ],
    [
      /\b(?:predict(?:s|ed|ion of)?|forecast(?:s)? the exact)\b[^.]{0,30}\baftershock/i,
      'The forecast gives chances over a window; it does not predict a specific aftershock.',
    ],
    [
      /\bno (?:chance|possibility|risk) of (?:a )?(?:larger|bigger|stronger)\b/i,
      'A larger earthquake than the mainshock is unlikely but not impossible.',
    ],
  ]
  for (const [re, message] of bad) for (const m of all(re, text)) out.push({ message, match: m[0] })
  return out
}

const tsunamiMessageLevels: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  for (const m of all(/tsunami watch[^.]{0,120}\b(?:wireless emergency alert|WEA)\b/gi, text))
    if (!/\bnot\b|\bnever\b|\bno\b|\bisn't\b/i.test(m[0]))
      out.push({
        message: 'A tsunami watch is not sent as a Wireless Emergency Alert.',
        match: m[0],
      })
  for (const m of all(/\btsunami (?:alert|alarm|emergency|danger) (?:message|level)\b/gi, text))
    out.push({
      message: 'The U.S. message levels are Warning, Advisory, Watch and Information Statement.',
      match: m[0],
    })
  for (const m of all(/tsunami warning[^.]{0,80}\bno action (?:is )?(?:required|needed)\b/gi, text))
    out.push({ message: 'A tsunami warning calls for immediate action.', match: m[0] })
  return out
}

const tsunamiLocalDistantTiming: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  for (const m of all(
    /\b(?:local|nearby)[- ](?:source )?tsunami[^.;]{0,100}?(\d+(?:\.\d+)?)\s*(hours?|h)\b/gi,
    text,
  ))
    if (Number(m[1]) >= 2)
      out.push({
        message: 'A local tsunami reaches the coast in minutes to under an hour, not hours.',
        match: m[0],
      })
  for (const m of all(
    /\b(?:distant|far-field|transpacific)[- ](?:source )?tsunami[^.;]{0,100}?(\d+)\s*(minutes?|min)\b/gi,
    text,
  ))
    if (Number(m[1]) < 60)
      out.push({
        message: 'A distant tsunami takes hours to arrive, not minutes.',
        match: m[0],
      })
  return out
}

const debrisFlowRainfallWording: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  const re =
    /\b(?:threshold|trigger(?:s|ed)?)\b[^.]{0,60}\b(?:24[- ]hours?|daily (?:rain(?:fall)?|total)|all day|steady rain)\b/gi
  for (const m of all(re, text))
    out.push({
      message:
        'Post-fire debris flows are triggered by short, intense rain (15 to 60 minutes), not daily totals.',
      match: m[0],
    })
  return out
}

const groundFailureRegionalWording: Rule = (text) => {
  const out: { message: string; match: string }[] = []
  for (const m of all(
    /\b(?:your|this|the|that) (?:building|home|house|slope|site|lot)\s+(?:will|is going to)\s+(?:fail|liquefy|collapse|slide)\b/gi,
    text,
  ))
    out.push({
      message: 'Ground failure models describe regions, not whether one site will fail.',
      match: m[0],
    })
  return out
}

export const GEO_LINT_RULES: Readonly<Record<string, Rule>> = {
  magnitude_intensity_labels: magnitudeIntensityLabels,
  alert_level_color_pair: alertLevelColorPair,
  volcano_notice_syntax: volcanoNoticeSyntax,
  eew_timing_limits: eewTimingLimits,
  aftershock_probability_wording: aftershockProbabilityWording,
  tsunami_message_levels: tsunamiMessageLevels,
  tsunami_local_distant_timing: tsunamiLocalDistantTiming,
  debris_flow_rainfall_wording: debrisFlowRainfallWording,
  ground_failure_regional_wording: groundFailureRegionalWording,
}

export const GEO_LINT_RULE_IDS: readonly string[] = Object.keys(GEO_LINT_RULES)

/** Run the named rules over `text`; ids that are not earth science rules are skipped. */
export function runGeoLint(text: string, ruleIds: readonly string[]): GeoLintIssue[] {
  const issues: GeoLintIssue[] = []
  for (const id of ruleIds) {
    const rule = GEO_LINT_RULES[id]
    if (rule) for (const hit of rule(text)) issues.push({ rule: id, ...hit })
  }
  return issues
}
