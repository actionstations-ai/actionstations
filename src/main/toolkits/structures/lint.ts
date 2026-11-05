// Format and consistency checks the structures toolkit names (spec 0471 FR-4): placard
// categories written as words and paired with their color, the OSHA reporting clocks, the
// excavation rules the scenarios rely on, who has authority to declare a building unsafe, and
// crane picks that continue past the wind limit. Pure functions over strings and structured
// fields; each returns problems a generator or an evaluator can show and never throws.

export const STRUCTURES_LINT_RULES = [
  'structures.placard_words',
  'structures.osha_clock',
  'structures.excavation_rules',
  'structures.authority',
  'structures.crane_wind',
] as const
export type StructuresLintRule = (typeof STRUCTURES_LINT_RULES)[number]

export interface StructuresProblem {
  rule: StructuresLintRule
  message: string
  /** The field or text the problem is in. */
  where: string
}

export const PLACARD_CATEGORIES = ['INSPECTED', 'RESTRICTED USE', 'UNSAFE'] as const
const PLACARD_COLOR: Record<(typeof PLACARD_CATEGORIES)[number], string> = {
  INSPECTED: 'green',
  'RESTRICTED USE': 'yellow',
  UNSAFE: 'red',
}

/** Each color word is paired with the nearest category word within 24 characters, in either order. */
function colorMismatches(text: string): StructuresProblem[] {
  const cats = [...text.matchAll(/\b(INSPECTED|RESTRICTED USE|UNSAFE)\b/gi)].map((m) => ({
    cat: m[1]!.toUpperCase() as (typeof PLACARD_CATEGORIES)[number],
    at: m.index!,
    end: m.index! + m[0].length,
  }))
  const out: StructuresProblem[] = []
  for (const m of text.matchAll(/\b(green|yellow|red)\b/gi)) {
    const color = m[1]!.toLowerCase()
    const gap = (c: (typeof cats)[number]): number =>
      c.end <= m.index! ? m.index! - c.end : c.at - (m.index! + m[0].length)
    const nearest = cats.map((c) => ({ c, d: gap(c) })).sort((a, b) => a.d - b.d)[0]
    if (!nearest || nearest.d > 24 || color === PLACARD_COLOR[nearest.c.cat]) continue
    out.push({
      rule: 'structures.placard_words',
      where: text.slice(0, 60),
      message: `${nearest.c.cat} is ${PLACARD_COLOR[nearest.c.cat]}, not ${color}.`,
    })
  }
  return out
}

// ---- placards ----------------------------------------------------------------------------

/**
 * A placard category must be one of the three words, and a color named next to a category must
 * be that category's color (UNSAFE is red, never green or yellow). A bare "red tag" or "green
 * placard" with no category word is flagged: the category is always written as words.
 */
export function checkPlacardWords(
  category: string | undefined,
  texts: readonly string[],
): StructuresProblem[] {
  const out: StructuresProblem[] = []
  if (category !== undefined && !(PLACARD_CATEGORIES as readonly string[]).includes(category))
    out.push({
      rule: 'structures.placard_words',
      where: 'category',
      message: `"${category}" is not a placard category; use INSPECTED, RESTRICTED USE or UNSAFE.`,
    })
  for (const text of texts) {
    out.push(...colorMismatches(text))
    const bare = /\b(green|yellow|red)[- ](?:tag|tagged|placard|placarded|sticker)\b/i.exec(text)
    if (bare && !PLACARD_CATEGORIES.some((c) => new RegExp(`\\b${c}\\b`, 'i').test(text)))
      out.push({
        rule: 'structures.placard_words',
        where: text.slice(0, 60),
        message: `"${bare[0]}" names a placard by color alone; write the category (INSPECTED, RESTRICTED USE or UNSAFE).`,
      })
  }
  return out
}

// ---- OSHA clocks -------------------------------------------------------------------------

export type OshaEvent =
  'Work-related fatality' | 'In-patient hospitalization' | 'Amputation' | 'Loss of an eye'

/** Hours allowed to report an event under 29 CFR 1904.39 (a summary). */
export const oshaClockHours = (event: string): 8 | 24 | undefined =>
  event === 'Work-related fatality'
    ? 8
    : event === 'In-patient hospitalization' || event === 'Amputation' || event === 'Loss of an eye'
      ? 24
      : undefined

/** The record's clock and due time must follow its event type; times are checked when both parse. */
export function checkOshaRecord(r: {
  eventType?: string
  clockHours?: string
  occurredAt?: string
  dueBy?: string
}): StructuresProblem[] {
  const out: StructuresProblem[] = []
  const want = r.eventType ? oshaClockHours(r.eventType) : undefined
  if (want && r.clockHours !== undefined && Number(r.clockHours) !== want)
    out.push({
      rule: 'structures.osha_clock',
      where: 'clockHours',
      message: `${r.eventType} is reported within ${want} hours, not ${r.clockHours}.`,
    })
  const start = r.occurredAt ? Date.parse(r.occurredAt.replace(' ', 'T')) : NaN
  const due = r.dueBy ? Date.parse(r.dueBy.replace(' ', 'T')) : NaN
  if (want && !Number.isNaN(start) && !Number.isNaN(due) && due - start !== want * 3_600_000)
    out.push({
      rule: 'structures.osha_clock',
      where: 'dueBy',
      message: `The due time must be ${want} hours after the event was learned of.`,
    })
  return out
}

const FATALITY_24 =
  /\b(?:fatalit(?:y|ies)|death|died)\b[^.;]{0,80}\bwithin (?:24|twenty-four) hours\b/i
const INJURY_8 =
  /\b(?:hospitali[sz]ation|amputation|loss of an eye)\b[^.;]{0,80}\bwithin (?:8|eight) hours\b/i

/** Prose that states the wrong clock for the event it names. */
export function checkOshaProse(texts: readonly string[]): StructuresProblem[] {
  const out: StructuresProblem[] = []
  for (const t of texts) {
    if (FATALITY_24.test(t))
      out.push({
        rule: 'structures.osha_clock',
        where: t.slice(0, 60),
        message: 'A work-related fatality is reported to OSHA within 8 hours, not 24.',
      })
    if (INJURY_8.test(t))
      out.push({
        rule: 'structures.osha_clock',
        where: t.slice(0, 60),
        message:
          'An in-patient hospitalization, amputation or loss of an eye is reported within 24 hours, not 8.',
      })
  }
  return out
}

// ---- excavation rules ---------------------------------------------------------------------

const ENGINEERED_DEPTH =
  /\b(?:20|twenty)[- ](?:feet|foot|ft)\b[^.]{0,80}\b(?:registered professional engineer|professional engineer|engineer)\b|\b(?:registered professional engineer|professional engineer|engineer)\b[^.]{0,80}\b(?:20|twenty)[- ](?:feet|foot|ft)\b/i

/** Prose may not state a depth threshold for engineered trench systems (unverified). */
export function checkExcavationProse(texts: readonly string[]): StructuresProblem[] {
  return texts
    .filter((t) => ENGINEERED_DEPTH.test(t))
    .map((t) => ({
      rule: 'structures.excavation_rules' as const,
      where: t.slice(0, 60),
      message:
        'Do not state a depth at which a trench system must be engineered; say a registered professional engineer approves designs outside the listed options.',
    }))
}

/**
 * An inspection record for an excavation 5 feet deep or more needs a protective system, and one
 * 4 feet or deeper needs an exit item; a record that lists the exit as OK with a deficiency note
 * is left to the reader.
 */
export function checkExcavationRecord(r: {
  depthFt?: string
  protectiveSystem?: string
  soilType?: string
}): StructuresProblem[] {
  const depth = r.depthFt ? Number.parseFloat(r.depthFt) : NaN
  if (Number.isNaN(depth) || depth < 5) return []
  const system = (r.protectiveSystem ?? '').trim()
  const none = system === '' || /^(?:none|no|n\/a)\b/i.test(system)
  const rock = /stable rock/i.test(r.soilType ?? '')
  return none && !rock
    ? [
        {
          rule: 'structures.excavation_rules',
          where: 'protectiveSystem',
          message: `An excavation ${depth} feet deep needs a protective system unless it is in stable rock.`,
        },
      ]
    : []
}

// ---- authority ----------------------------------------------------------------------------

const NOT_THE_OFFICIAL =
  /\b(?:the )?(?:contractor|superintendent|evaluator|volunteer evaluator|engineer of record|owner|project manager)\b[^.]{0,40}\b(?:declares?|declared|condemns?|condemned)\b[^.]{0,30}\b(?:building|structure)\b[^.]{0,20}\bunsafe\b/i

/** Only the building official declares a building unsafe; evaluators recommend. */
export function checkAuthority(texts: readonly string[]): StructuresProblem[] {
  return texts
    .filter((t) => NOT_THE_OFFICIAL.test(t))
    .map((t) => ({
      rule: 'structures.authority' as const,
      where: t.slice(0, 60),
      message:
        'The building official declares a building unsafe; an evaluator or engineer recommends a placard.',
    }))
}

// ---- crane wind ---------------------------------------------------------------------------

export interface WindReading {
  time: string
  avgMph: string
  gustMph: string
  action: string
}

const num = (s: string | undefined): number => {
  const m = /\d+(?:\.\d+)?/.exec(s ?? '')
  return m ? Number.parseFloat(m[0]) : NaN
}

/** A reading at or above the stated wind limit may not be followed by "pick continues". */
export function checkCraneWind(
  limitText: string | undefined,
  log: readonly WindReading[],
): StructuresProblem[] {
  const limit = num(limitText)
  if (Number.isNaN(limit)) return []
  const out: StructuresProblem[] = []
  for (const r of log) {
    const reading = Math.max(num(r.avgMph) || 0, num(r.gustMph) || 0)
    if (reading >= limit && /\b(?:continues?|proceed|resumed?)\b/i.test(r.action))
      out.push({
        rule: 'structures.crane_wind',
        where: `wind log ${r.time}`,
        message: `The reading of ${reading} mph is at or above the ${limit} mph limit, so the pick may not continue.`,
      })
  }
  return out
}
