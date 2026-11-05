// Format rules of the media environment toolkit (spec 0458 FR-4), named in the toolkit as
// `media.*` lint rules. Each is a pure check over one inject's type and fields and returns
// plain issues: every attributed claim has a source, times agree with the exercise clock, a
// correction names what was wrong and what is right, a holding statement states what is known,
// what is not known and what is being done, and outlets, handles and people are fictional.
export interface MediaIssue {
  rule: string
  message: string
}

export interface MediaLintContext {
  /** Minute of the day (0 to 1439) the inject is delivered at, from the exercise clock. */
  deliveryMinuteOfDay?: number
  /** Minutes a stamped time may differ from the delivery time. */
  toleranceMin?: number
  /** Extra real outlet or person names a project wants flagged. */
  extraRealNames?: readonly string[]
}

type Fields = Record<string, unknown>

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

/** Largest national outlets and wire services; a project adds its own through the context. */
export const REAL_OUTLETS: readonly string[] = [
  'Associated Press',
  'Reuters',
  'Bloomberg',
  'CNN',
  'BBC',
  'Fox News',
  'MSNBC',
  'NBC News',
  'CBS News',
  'ABC News',
  'NPR',
  'PBS',
  'New York Times',
  'Washington Post',
  'Wall Street Journal',
  'USA Today',
  'Politico',
  'Al Jazeera',
  'The Guardian',
  'Agence France-Presse',
  'CNBC',
  'Los Angeles Times',
]

/** A few public figures a generated exercise must not name; projects extend the list. */
export const REAL_PUBLIC_FIGURES: readonly string[] = [
  'Joe Biden',
  'Donald Trump',
  'Barack Obama',
  'Kamala Harris',
  'Elon Musk',
  'Taylor Swift',
]

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function wordMatch(text: string, name: string): boolean {
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRe(name)}([^A-Za-z0-9]|$)`, 'i').test(text)
}

/** Whole-field text of an inject, for the checks that scan everything. */
function allText(fields: Fields): string {
  const parts: string[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'string') parts.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(fields)
  return parts.join('\n')
}

// ---- media.fictional_names ------------------------------------------------------------------

export function fictionalNames(fields: Fields, ctx: MediaLintContext = {}): MediaIssue[] {
  const text = allText(fields)
  const names = [...REAL_OUTLETS, ...REAL_PUBLIC_FIGURES, ...(ctx.extraRealNames ?? [])]
  return names
    .filter((n) => n.length > 2 && wordMatch(text, n))
    .map((n) => ({
      rule: 'media.fictional_names',
      message: `"${n}" is a real outlet or person; use a fictional name.`,
    }))
}

// ---- media.attribution ----------------------------------------------------------------------

const ATTRIBUTION =
  /\b(said|says|told|according to|stated|confirmed|announced|wrote|reported by|spokes(?:person|man|woman)|officials?|did not respond|declined to comment|in a statement)\b/i
const VAGUE_SOURCE =
  /\b(sources say|reportedly|it is said|some say|people are saying|many believe)\b/i

/** Paragraphs of the news text fields: body, text or each update. */
function newsParagraphs(type: string, fields: Fields): string[] {
  if (type === 'live_blog')
    return Array.isArray(fields.updates) ? (fields.updates as Fields[]).map((u) => str(u.text)) : []
  const body = str(fields.body) || str(fields.text)
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

export const ATTRIBUTION_TYPES = new Set(['news_article', 'wire_alert', 'live_blog', 'push_alert'])

export function attribution(type: string, fields: Fields): MediaIssue[] {
  if (!ATTRIBUTION_TYPES.has(type)) return []
  const issues: MediaIssue[] = []
  for (const p of newsParagraphs(type, fields)) {
    const clip = p.length > 60 ? `${p.slice(0, 57)}...` : p
    if (/[“"][^”"]{8,}[”"]/.test(p) && !ATTRIBUTION.test(p))
      issues.push({ rule: 'media.attribution', message: `A quote has no speaker: "${clip}"` })
    if (VAGUE_SOURCE.test(p))
      issues.push({
        rule: 'media.attribution',
        message: `A claim rests on an unnamed source with no role: "${clip}"`,
      })
  }
  if (
    type === 'news_article' &&
    newsParagraphs(type, fields).length > 0 &&
    !newsParagraphs(type, fields).some((p) => ATTRIBUTION.test(p))
  )
    issues.push({
      rule: 'media.attribution',
      message: 'No claim in the article is attributed to a source.',
    })
  return issues
}

// ---- media.clock ----------------------------------------------------------------------------

const TIME = /\b(\d{1,2}):(\d{2})\s*([AP])\.?M\b/i
const STAMP_FIELDS = ['issuedAt', 'publishedAt', 'updatedAt', 'time', 'airTime', 'receivedAt']

function minuteOfDay(text: string): number | undefined {
  const m = TIME.exec(text)
  if (!m) return undefined
  const h = Number(m[1]) % 12
  return (h + (m[3]!.toUpperCase() === 'P' ? 12 : 0)) * 60 + Number(m[2])
}

export function clock(fields: Fields, ctx: MediaLintContext = {}): MediaIssue[] {
  if (ctx.deliveryMinuteOfDay === undefined) return []
  const tol = ctx.toleranceMin ?? 5
  const issues: MediaIssue[] = []
  for (const key of STAMP_FIELDS) {
    const v = str(fields[key])
    const at = minuteOfDay(v)
    if (at !== undefined && Math.abs(at - ctx.deliveryMinuteOfDay) > tol)
      issues.push({
        rule: 'media.clock',
        message: `${key} says "${v}", which is more than ${tol} minutes from the exercise clock time of this inject.`,
      })
  }
  return issues
}

// ---- media.correction -----------------------------------------------------------------------

export function correction(type: string, fields: Fields): MediaIssue[] {
  if (type !== 'correction_notice') return []
  const wrong = str(fields.wasWrong)
    .trim()
    .replace(/[.!?]+$/, '')
  const right = str(fields.isRight)
    .trim()
    .replace(/[.!?]+$/, '')
  const issues: MediaIssue[] = []
  if (!wrong)
    issues.push({ rule: 'media.correction', message: 'A correction must say what was wrong.' })
  if (!right)
    issues.push({ rule: 'media.correction', message: 'A correction must say what is right.' })
  if (wrong && right && wrong.toLowerCase() === right.toLowerCase())
    issues.push({
      rule: 'media.correction',
      message: 'What was wrong and what is right are the same text.',
    })
  const headline = str(fields.headline).toLowerCase()
  if (wrong && headline && headline.includes(wrong.toLowerCase()))
    issues.push({
      rule: 'media.correction',
      message: 'The headline repeats the false claim; do not headline the error.',
    })
  return issues
}

// ---- media.holding_statement ----------------------------------------------------------------

export function holdingStatement(type: string, fields: Fields, variant = 'default'): MediaIssue[] {
  if (type !== 'holding_statement' || variant === 'full') return []
  const issues: MediaIssue[] = []
  if (!strs(fields.known).length)
    issues.push({
      rule: 'media.holding_statement',
      message: 'A holding statement must say what is known.',
    })
  if (!strs(fields.notKnown).length)
    issues.push({
      rule: 'media.holding_statement',
      message: 'A holding statement must say what is not yet known.',
    })
  if (!strs(fields.beingDone).length)
    issues.push({
      rule: 'media.holding_statement',
      message: 'A holding statement must say what is being done.',
    })
  if (!str(fields.nextUpdate).trim())
    issues.push({
      rule: 'media.holding_statement',
      message: 'A holding statement should say when the next update comes.',
    })
  const words = allText({ k: fields.known, n: fields.notKnown, b: fields.beingDone })
    .split(/\s+/)
    .filter(Boolean).length
  if (words > 200)
    issues.push({
      rule: 'media.holding_statement',
      message: `The statement is ${words} words; a holding statement is short (under about 150).`,
    })
  return issues
}

/** Every rule the toolkit names, run on one inject. */
export function lintMediaInject(
  type: string,
  fields: Fields,
  ctx: MediaLintContext = {},
  variant = 'default',
): MediaIssue[] {
  return [
    ...fictionalNames(fields, ctx),
    ...attribution(type, fields),
    ...clock(fields, ctx),
    ...correction(type, fields),
    ...holdingStatement(type, fields, variant),
  ]
}

export const MEDIA_LINT_RULE_IDS = [
  'media.attribution',
  'media.clock',
  'media.correction',
  'media.holding_statement',
  'media.fictional_names',
] as const
