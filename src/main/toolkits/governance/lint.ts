// Format and consistency checks the governance toolkit names (spec 0459 FR-4): the exercise-aid
// line on every document, a fictional company, the content an Item 1.05 draft must state, an
// Item 8.01 draft that does not claim materiality, decisions that carry an owner and a basis, and
// a disclosure draft that agrees with the latest materiality worksheet. Pure functions over
// structured inputs; each returns problems a generator or an evaluator can show, never throws.

export const GOVERNANCE_LINT_RULES = [
  'gov_exercise_aid',
  'gov_fictional_company',
  'gov_item_105_content',
  'gov_item_801_no_materiality',
  'gov_decisions_documented',
] as const
export type GovernanceLintRule = (typeof GOVERNANCE_LINT_RULES)[number]

export interface GovernanceProblem {
  rule: GovernanceLintRule | 'gov_disclosure_matches_worksheet'
  path: string
  message: string
}

type Fields = Record<string, unknown>
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const filled = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

/** Every string in `value`, depth first, skipping the `figures` field (drawn data, not prose). */
export function allStrings(value: unknown, out: string[] = [], key = ''): string[] {
  if (key === 'figures') return out
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) allStrings(v, out)
  else if (isRecord(value)) for (const [k, v] of Object.entries(value)) allStrings(v, out, k)
  return out
}

// ---- exercise-aid line -------------------------------------------------------------------

/** Spec 0426 NFR-5: every governance document says it is an exercise aid, not legal advice. */
export function checkExerciseAid(fields: Fields): GovernanceProblem[] {
  const aid = fields.exerciseAid
  if (!filled(aid))
    return [
      {
        rule: 'gov_exercise_aid',
        path: 'fields.exerciseAid',
        message:
          'Add the exercise-aid line: "Exercise aid, not legal advice. Check the current rule and your counsel."',
      },
    ]
  if (!/not legal advice/i.test(String(aid)))
    return [
      {
        rule: 'gov_exercise_aid',
        path: 'fields.exerciseAid',
        message: 'The exercise-aid line must say the document is not legal advice.',
      },
    ]
  return []
}

// ---- fictional company -------------------------------------------------------------------

/** Well-known issuers that must never appear in a generated governance document. */
const REAL_ISSUERS = [
  'Apple Inc',
  'Microsoft',
  'Alphabet',
  'Amazon',
  'Tesla',
  'Nvidia',
  'Oracle Corporation',
  'IBM',
  'Intel Corporation',
  'Cisco Systems',
  'SolarWinds',
  'Colonial Pipeline',
  'MGM Resorts',
  'Caesars Entertainment',
  'Equifax',
  'Capital One',
  'JPMorgan',
  'Bank of America',
  'Wells Fargo',
  'Goldman Sachs',
  'Citigroup',
  'Boeing',
  'General Motors',
  'Walmart',
  'Home Depot',
  'Marriott',
  'UnitedHealth',
  'Change Healthcare',
  'CrowdStrike',
  'Okta',
  'Snowflake',
  'Johnson Controls',
  'Clorox',
  'Ticketmaster',
  'Uber Technologies',
]
const REAL_ISSUER_RE = new RegExp(
  `\\b(?:${REAL_ISSUERS.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i',
)
const TICKER_RE = /\b(?:NYSE|Nasdaq|NASDAQ|AMEX|OTC)\s*[:-]\s*[A-Z]{1,5}\b/

/**
 * Generated governance documents use a fictional company and show no stock ticker: a ticker is
 * the one thing that ties a draft filing to a real issuer.
 */
export function checkFictionalCompany(fields: Fields): GovernanceProblem[] {
  const out: GovernanceProblem[] = []
  for (const text of allStrings(fields)) {
    const real = REAL_ISSUER_RE.exec(text)
    if (real)
      out.push({
        rule: 'gov_fictional_company',
        path: 'fields',
        message: `"${real[0]}" is a real company; use a fictional one.`,
      })
    const ticker = TICKER_RE.exec(text)
    if (ticker)
      out.push({
        rule: 'gov_fictional_company',
        path: 'fields',
        message: `Remove the trading symbol "${ticker[0]}"; the company is fictional and shows no ticker.`,
      })
  }
  return out
}

// ---- Item 1.05 content -------------------------------------------------------------------

const ITEM_105_PARTS: [string, string][] = [
  ['nature', 'the nature of the incident'],
  ['scope', 'the scope of the incident'],
  ['timing', 'the timing of the incident'],
  ['materialImpact', 'its material impact or reasonably likely material impact'],
]

/** An Item 1.05 draft states nature, scope, timing and the material impact or likely impact. */
export function checkItem105Content(fields: Fields): GovernanceProblem[] {
  if (fields.item !== '1.05') return []
  const out: GovernanceProblem[] = []
  for (const [key, what] of ITEM_105_PARTS)
    if (!filled(fields[key]))
      out.push({
        rule: 'gov_item_105_content',
        path: `fields.${key}`,
        message: `An Item 1.05 draft must state ${what}.`,
      })
  const impact = String(fields.materialImpact ?? '')
  if (/\bhas not determined\b[^.]{0,120}\bmaterial\b/i.test(impact))
    out.push({
      rule: 'gov_item_105_content',
      path: 'fields.materialImpact',
      message:
        'An Item 1.05 report follows a materiality determination; text saying the company has not determined materiality belongs in an Item 8.01 report.',
    })
  return out
}

// ---- Item 8.01 does not claim materiality ------------------------------------------------

const NEGATION = /\b(?:not|no|nor|neither|cannot|without|unable)\b/i

/** Sentences of `text`, split at full stops, question and exclamation marks. */
const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+/).filter(Boolean)

/**
 * An Item 8.01 draft describes an incident without a materiality determination. A sentence that
 * says the incident is material (without a negation) or heads the report as a material incident
 * is flagged.
 */
export function checkItem801NoMateriality(fields: Fields): GovernanceProblem[] {
  if (fields.item !== '8.01') return []
  const out: GovernanceProblem[] = []
  if (/material cybersecurity incident/i.test(String(fields.headline ?? '')))
    out.push({
      rule: 'gov_item_801_no_materiality',
      path: 'fields.headline',
      message:
        'An Item 8.01 report is headed "Other Events", not "Material Cybersecurity Incidents".',
    })
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'headline' || typeof value !== 'string') continue
    for (const s of sentences(value))
      if (/\bmaterial\b/i.test(s) && !NEGATION.test(s) && !/\bif\b/i.test(s))
        out.push({
          rule: 'gov_item_801_no_materiality',
          path: `fields.${key}`,
          message: `An Item 8.01 report does not claim materiality: "${s.trim().slice(0, 100)}"`,
        })
  }
  return out
}

// ---- decisions documented ----------------------------------------------------------------

/**
 * Decision records carry an owner and a basis: every decision log entry, a materiality
 * determination, and a ransom decision once it is no longer pending.
 */
export function checkDecisionsDocumented(fields: Fields): GovernanceProblem[] {
  const out: GovernanceProblem[] = []
  const gap = (path: string, what: string): void => {
    out.push({
      rule: 'gov_decisions_documented',
      path,
      message: `A decision needs ${what} on the record.`,
    })
  }
  if (Array.isArray(fields.entries))
    fields.entries.forEach((e, i) => {
      if (!isRecord(e)) return
      const label = `fields.entries[${i}]`
      if (!filled(e.decidedBy)) gap(`${label}.decidedBy`, 'who decided it')
      if (!filled(e.basis)) gap(`${label}.basis`, 'its basis')
      if (!filled(e.time)) gap(`${label}.time`, 'its time')
    })
  const determination = fields.determination
  if (typeof determination === 'string' && determination !== 'not yet determined') {
    if (!filled(fields.determinedBy)) gap('fields.determinedBy', 'who made the determination')
    if (!filled(fields.determinedAt)) gap('fields.determinedAt', 'the time of the determination')
    if (!filled(fields.basis)) gap('fields.basis', 'the basis for the determination')
  }
  const decision = fields.decision
  if (typeof decision === 'string' && decision !== 'pending' && 'options' in fields) {
    if (!filled(fields.decidedBy)) gap('fields.decidedBy', 'who decided')
    if (!filled(fields.decidedAt)) gap('fields.decidedAt', 'the time of the decision')
  }
  return out
}

// ---- disclosure against the worksheet ----------------------------------------------------

export interface WorksheetFacts {
  determination: 'material' | 'not material' | 'not yet determined'
  /** Date text of the determination, e.g. "October 23, 2026, 10:05 a.m.". */
  determinedAt?: string
}

/** The month and day of a date text ("October 23"), or undefined when it has none. */
function monthDay(text: string | undefined): string | undefined {
  const m = text && /([A-Z][a-z]+)\s+(\d{1,2})\b/.exec(text)
  return m ? `${m[1]} ${m[2]}` : undefined
}

/**
 * The disclosure draft must agree with the latest materiality worksheet (spec 0459 FR-4): an
 * Item 1.05 draft needs a determination of "material", an Item 8.01 draft cannot follow one, and
 * the draft's timing names the day the worksheet records.
 */
export function checkDisclosureMatchesWorksheet(
  draft: Fields,
  worksheet: WorksheetFacts,
): GovernanceProblem[] {
  const out: GovernanceProblem[] = []
  const rule = 'gov_disclosure_matches_worksheet' as const
  if (draft.item === '1.05' && worksheet.determination !== 'material')
    out.push({
      rule,
      path: 'fields.item',
      message: `The worksheet records "${worksheet.determination}"; an Item 1.05 report follows a determination of material.`,
    })
  if (draft.item === '8.01' && worksheet.determination === 'material')
    out.push({
      rule,
      path: 'fields.item',
      message:
        'The worksheet records the incident as material; an Item 8.01 report does not meet the Item 1.05 duty.',
    })
  const day = monthDay(worksheet.determinedAt)
  if (draft.item === '1.05' && day && !String(draft.timing ?? '').includes(day))
    out.push({
      rule,
      path: 'fields.timing',
      message: `The worksheet records the determination on ${day}; the timing text does not mention that date.`,
    })
  return out
}
