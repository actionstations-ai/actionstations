// Format and consistency checks the humanitarian toolkit names (spec 0469 FR-7): cluster
// activation statements, the Saving Lives Together responsibility line, field security
// guardrails (decision and communications level only), gap list counts and funding arithmetic.
// Pure functions over text or structured fields; each returns problems, never throws.

export const HUMANITARIAN_LINT_RULES = [
  'humanitarian_cluster_activation',
  'humanitarian_slt_responsibility',
  'humanitarian_security_guardrail',
  'humanitarian_gap_list',
  'humanitarian_funding_arithmetic',
  'humanitarian_movement_decision',
] as const

export interface HumanitarianProblem {
  message: string
}

const problem = (message: string): HumanitarianProblem => ({ message })

// ---- cluster activation ------------------------------------------------------------------

const HC_ACTIVATES =
  /\b(?:clusters?\b[^.]{0,40}\b(?:was|were|has been|have been|is|are)\s+activated\s+by\s+the\s+(?:Humanitarian Coordinator|HC)\b|(?:Humanitarian Coordinator|HC)\s+(?:has\s+|will\s+)?activate[sd]?\s+(?:the\s+)?clusters?\b)/i
const REFUGEE_SETTING = /\brefugee\s+(?:influx|camp|settlement|response|site)s?\b/i
const CLUSTER_ACTIVATED =
  /\b(?:clusters?\s+(?:was|were|has been|have been|is|are)\s+activated|activate\s+(?:the\s+)?clusters?|cluster activation)\b/i
const NEGATED = /\b(?:not|no|instead of|rather than)\b[^.]{0,30}\bcluster/i

/** Clusters are requested by the HC and activated by the ERC; refugee settings do not use them. */
export function checkClusterActivation(text: string): HumanitarianProblem[] {
  const out: HumanitarianProblem[] = []
  if (HC_ACTIVATES.test(text))
    out.push(
      problem(
        'The Humanitarian Coordinator requests cluster activation; the Emergency Relief Coordinator decides, with the IASC Principals’ endorsement.',
      ),
    )
  if (REFUGEE_SETTING.test(text) && CLUSTER_ACTIVATED.test(text) && !NEGATED.test(text))
    out.push(
      problem(
        'Refugee settings use the refugee coordination model, not cluster activation; the text activates clusters in one.',
      ),
    )
  return out
}

// ---- Saving Lives Together ---------------------------------------------------------------

const UN_RESPONSIBLE =
  /\b(?:UN|United Nations)\s+(?:is|are|will be|has become|becomes)\s+responsible\s+for\s+(?:the\s+)?(?:NGO|partner|NGO partner)s?(?:['’]s?)?\s*(?:staff\s+)?security\b|\b(?:UN|United Nations)\s+(?:will\s+)?takes?\s+(?:on\s+)?responsibility\s+for\s+(?:the\s+)?security\s+of\s+(?:NGO|partner)/i

export function checkSavingLivesTogether(text: string): HumanitarianProblem[] {
  return UN_RESPONSIBLE.test(text)
    ? [
        problem(
          'Taking part in the security collaboration framework does not make the UN responsible for an NGO’s security.',
        ),
      ]
    : []
}

// ---- field security guardrail ------------------------------------------------------------

const GUARDRAILS: { pattern: RegExp; what: string }[] = [
  {
    pattern:
      /\bransom\b[^.]{0,60}(?:US\$|USD|\$|€|£)\s?\d|\b(?:pay|paid|paying|offer|offered)\s+(?:a|the)\s+ransom\b/i,
    what: 'ransom amounts or payment',
  },
  {
    pattern:
      /\bnegotiat\w*\s+(?:tactics?|strateg(?:y|ies)|scripts?|techniques?)\b|\bnegotiat\w*\s+with\s+the\s+(?:kidnappers|captors|abductors|hostage[- ]takers)\b/i,
    what: 'negotiation tactics',
  },
  {
    pattern:
      /\b(?:evad\w*|escap\w*|resist\w*)\s+(?:capture|detention|arrest|custody)\b|\bhow\s+to\s+(?:escape|evade)\b|\b(?:pick|break)\s+(?:the\s+)?(?:lock|handcuffs)\b/i,
    what: 'evasion or detention-resistance technique',
  },
]

/** Staff security content stays at the level of decisions and communications. */
export function checkSecurityGuardrail(text: string): HumanitarianProblem[] {
  return GUARDRAILS.filter((g) => g.pattern.test(text)).map((g) =>
    problem(
      `Staff security content stays at the level of decisions and communications; remove ${g.what}.`,
    ),
  )
}

// ---- gap list ----------------------------------------------------------------------------

export interface GapLine {
  id?: string
  status: string
  owner?: string
}

/** An assigned or covered gap names its partner; the summary counts match the lines. */
export function checkGapList(gaps: readonly GapLine[], summary?: string): HumanitarianProblem[] {
  const out: HumanitarianProblem[] = []
  for (const g of gaps)
    if ((g.status === 'assigned' || g.status === 'covered') && !g.owner?.trim())
      out.push(problem(`Gap ${g.id ?? ''} is ${g.status} but names no partner.`.replace('  ', ' ')))
  if (summary) {
    const count = (s: string): number => gaps.filter((g) => g.status === s).length
    const stated = (word: string): number | undefined => {
      const m = new RegExp(`(\\d+)\\s+${word}\\b`, 'i').exec(summary)
      return m ? Number(m[1]) : undefined
    }
    for (const s of ['unassigned', 'assigned', 'covered']) {
      const n = stated(s)
      if (n !== undefined && n !== count(s))
        out.push(problem(`The summary says ${n} ${s} but the list has ${count(s)}.`))
    }
    const total = /^\s*(\d+)\s+gaps?\b/i.exec(summary)
    if (total && Number(total[1]) !== gaps.length)
      out.push(problem(`The summary says ${total[1]} gaps but the list has ${gaps.length}.`))
  }
  return out
}

// ---- funding arithmetic ------------------------------------------------------------------

const num = (s: unknown): number | undefined => {
  if (typeof s !== 'string' && typeof s !== 'number') return undefined
  const n = Number(String(s).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && String(s).trim() !== '' ? n : undefined
}

export interface FundingTotals {
  required?: unknown
  received?: unknown
  gap?: unknown
  percentFunded?: unknown
}

/** Gap is required minus received; percent funded follows from the amounts (within a point). */
export function checkFundingArithmetic(t: FundingTotals): HumanitarianProblem[] {
  const [req, rec, gap, pct] = [t.required, t.received, t.gap, t.percentFunded].map(num)
  const out: HumanitarianProblem[] = []
  if (req === undefined || rec === undefined) return out
  if (gap !== undefined && Math.abs(req - rec - gap) > 0.051)
    out.push(problem(`The gap is ${gap} but required minus received is ${(req - rec).toFixed(1)}.`))
  if (pct !== undefined && req > 0 && Math.abs((rec / req) * 100 - pct) > 1)
    out.push(
      problem(
        `Percent funded is ${pct} but received over required is ${((rec / req) * 100).toFixed(0)}.`,
      ),
    )
  return out
}

// ---- movement decision -------------------------------------------------------------------

export function checkMovementDecision(f: {
  decision?: unknown
  decidedBy?: unknown
  conditions?: unknown
}): HumanitarianProblem[] {
  const out: HumanitarianProblem[] = []
  const decided = typeof f.decision === 'string' && f.decision !== 'pending'
  if (decided && !(typeof f.decidedBy === 'string' && f.decidedBy.trim()))
    out.push(problem('A decided movement request names who decided.'))
  if (f.decision === 'conditional' && !(Array.isArray(f.conditions) && f.conditions.length))
    out.push(problem('A conditional approval lists its conditions.'))
  return out
}
