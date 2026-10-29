// Lints that hold the MSEL to the brief and to its own clock and calendar (#347): the
// STARTEX card states the brief's start time, every TIME_JUMP / ENDEX card states the clock the
// MSEL's own times give, one TIME_JUMP per phase, the day and date do not change between rows
// without a time jump, a weekday matches its calendar date (on the STARTEX and time-jump cards
// too, and the STARTEX day matches a date the request names, #364), and the player roles stay
// within the brief's audience and seat every entry of it (lint-audience.ts). Pure; lint.ts
// adds them to lintScenario.
import type { DomainProfile } from '@shared/domains'
import { exerciseMinutes, type LintWarning, type MselRow, type Scenario } from '@shared/schemas'
import { DATE_SOURCE, MONTHS, WEEKDAYS, dateKey } from '@shared/dates'
import { lintAudience } from './lint-audience'

export const START_TIME_MISMATCH = 'START_TIME_MISMATCH'
export const CLOCK_MISMATCH = 'CLOCK_MISMATCH'
export const BRIEF_TIME_OUTSIDE = 'BRIEF_TIME_OUTSIDE'
export const TIME_JUMP_REPEATED = 'TIME_JUMP_REPEATED'
export const DATE_DRIFT = 'DATE_DRIFT'
export const ROLES_EXCEED_AUDIENCE = 'ROLES_EXCEED_AUDIENCE'
export const OUTSIDE_PARTY_ROLE = 'OUTSIDE_PARTY_ROLE'

type W = LintWarning
const warn = (code: string, message: string, extra: Partial<W> = {}): W => ({
  code,
  severity: 'warning',
  message,
  source: 'lint',
  ...extra,
})

const DAY = 24 * 60
/** Minutes a stated clock may differ from the MSEL's own clock before it is flagged. */
const CLOCK_SLACK = 5
/** How long before STARTEX the request may set the scene (an overnight alert, a 06:50 call). */
const LEAD_IN_MINUTES = 180

const pad = (n: number): string => String(n).padStart(2, '0')
const clockText = (m: number): string => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`
const circular = (a: number, b: number): number => {
  const d = Math.abs(a - b) % DAY
  return Math.min(d, DAY - d)
}

/** "09:00", "6:15 PM", "9.30 am" → minutes after midnight, or undefined. */
function toMinutes(h: string, m: string, meridiem?: string): number | undefined {
  let hours = Number(h)
  const minutes = Number(m)
  if (hours > 23 || minutes > 59) return undefined
  const mer = meridiem?.toLowerCase().replace(/\./g, '')
  if (mer === 'pm' && hours < 12) hours += 12
  if (mer === 'am' && hours === 12) hours = 0
  return hours * 60 + minutes
}

/**
 * The clock a control card states: "It is 09:00", "It is now 19:30", "Current time: 09:00 AM",
 * "Narrative Clock: 08:00", "it's 6:15 PM". Undefined when the card states none.
 */
const CLOCK_STATEMENT =
  /\b(?:it is|it's|it’s|current (?:sim(?:ulated)? |narrative )?time(?: is)?:?|narrative clock(?: is)?:?|the time is)\s*(?:now\s+)?(\d{1,2})[:.](\d{2})\b\s*(a\.?m\.?|p\.?m\.?)?/i

export function statedClock(text: string): { minutes: number; quote: string } | undefined {
  const m = CLOCK_STATEMENT.exec(text)
  if (!m) return undefined
  const minutes = toMinutes(m[1]!, m[2]!, m[3])
  return minutes === undefined ? undefined : { minutes, quote: m[0].trim() }
}

const START_DEFAULT = '09:00'
const startOf = (s: Scenario): number => exerciseMinutes(s.brief?.startWallClock ?? START_DEFAULT)

/** STARTEX states the brief's start time (#347 item 4). */
function lintStartTime(s: Scenario): W[] {
  const start = s.msel.find((r) => r.purposeTag === 'STARTEX')
  if (!start || !s.brief?.startWallClock) return []
  const stated = statedClock(start.event)
  if (!stated || circular(stated.minutes, startOf(s)) <= CLOCK_SLACK) return []
  return [
    warn(
      START_TIME_MISMATCH,
      `The STARTEX row says "${stated.quote}", but the brief starts the exercise at ${s.brief.startWallClock}`,
      {
        rowId: start.id,
        suggestion: `Start the STARTEX card at ${s.brief.startWallClock}, or change the start time in the brief`,
      },
    ),
  ]
}

/** TIME_JUMP and ENDEX cards state the clock the MSEL's own times give. */
function lintControlClocks(s: Scenario): W[] {
  return s.msel.flatMap((row): W[] => {
    if (row.purposeTag !== 'TIME_JUMP' && row.purposeTag !== 'ENDEX') return []
    const stated = statedClock(row.event)
    if (!stated) return []
    const expected = (startOf(s) + exerciseMinutes(row.time)) % DAY
    if (circular(stated.minutes, expected) <= CLOCK_SLACK) return []
    return [
      warn(
        CLOCK_MISMATCH,
        `Row ${row.id} at ${row.time} says "${stated.quote}", but ${row.time} after a ${clockText(startOf(s))} start is ${clockText(expected)}`,
        {
          rowId: row.id,
          suggestion: `State the clock as ${clockText(expected)} on this card, or move the row to the time it states`,
        },
      ),
    ]
  })
}

const TIME_OF_DAY = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b\s*(a\.?m\.?|p\.?m\.?)?/gi

/**
 * The request names times of day, and none of them falls in the exercise window (or the few
 * hours before STARTEX that set the scene): the brief's start time most likely ignores the
 * request (a night release run at 09:00). Informational: the request is the designer's text.
 */
function lintBriefTimes(s: Scenario): W[] {
  const text = s.brief?.userPrompt
  if (!text || !s.brief.startWallClock) return []
  const times = [...text.matchAll(TIME_OF_DAY)]
    .map((m) => ({ minutes: toMinutes(m[1]!, m[2]!, m[3]), quote: m[0].trim() }))
    .filter((t): t is { minutes: number; quote: string } => t.minutes !== undefined)
  if (!times.length) return []
  const start = startOf(s)
  const length = Math.round((s.brief.durationHours ?? 4) * 60)
  const inWindow = (t: number): boolean => {
    const after = (t - start + DAY) % DAY
    return after <= length || after >= DAY - LEAD_IN_MINUTES
  }
  if (times.some((t) => inWindow(t.minutes))) return []
  const end = clockText((start + length) % DAY)
  return [
    {
      ...warn(
        BRIEF_TIME_OUTSIDE,
        `The request describes events at ${times[0]!.quote}, but the exercise runs ${s.brief.startWallClock}–${end} (the brief's start time)`,
        {
          suggestion: `Set the brief's start time to when the request's story begins (shortly before ${times[0]!.quote}), or change the times in the request`,
        },
      ),
      severity: 'info',
    },
  ]
}

const CONTROL = new Set<MselRow['purposeTag']>(['STARTEX', 'TIME_JUMP', 'ENDEX'])
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** One TIME_JUMP per phase, each saying something new (#347 item 2). */
function lintTimeJumps(s: Scenario): W[] {
  const out: W[] = []
  const seen: MselRow[] = []
  for (const row of s.msel) {
    if (row.purposeTag !== 'TIME_JUMP') continue
    const twin = seen.find(
      (e) =>
        e.phaseId === row.phaseId ||
        e.time === row.time ||
        norm(e.event.replace(/\b\d{1,2}[:.]\d{2}\b/g, '')) ===
          norm(row.event.replace(/\b\d{1,2}[:.]\d{2}\b/g, '')),
    )
    seen.push(row)
    if (!twin) continue
    const why =
      twin.phaseId === row.phaseId
        ? 'in the same phase'
        : twin.time === row.time
          ? `at the same time (${row.time})`
          : 'with the same text'
    out.push(
      warn(TIME_JUMP_REPEATED, `Row ${row.id} is a second TIME_JUMP ${why} as row ${twin.id}`, {
        rowId: row.id,
        suggestion:
          'Keep one TIME_JUMP at the start of each phase that moves the clock and the story on; turn this one into an inject or delete it',
      }),
    )
  }
  return out
}

// ---- calendar ---------------------------------------------------------------------------

const WEEKDAY = `(${WEEKDAYS.join('|')})`
const DATE = DATE_SOURCE

interface Day {
  weekday?: number
  /** "2026-10-22" */
  date?: string
  quote: string
}

export { dateKey }

const weekdayOf = (key: string): number => new Date(`${key}T12:00:00Z`).getUTCDay()
const weekdayIndex = (name: string): number => WEEKDAYS.indexOf(name.toLowerCase())
const capital = (w: string): string => `${w[0]!.toUpperCase()}${w.slice(1)}`
/** "2026-04-02" → "Thursday, April 2, 2026". */
const longDate = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return `${capital(WEEKDAYS[weekdayOf(key)]!)}, ${capital(MONTHS[m - 1]!)} ${d}, ${y}`
}

/** "Thursday, October 22, 2026" or "October 22, 2026 (Thursday)" where the 22nd is not a Thursday. */
function weekdayDateMismatch(text: string): string | undefined {
  const forms: [RegExp, number, number][] = [
    [new RegExp(String.raw`\b${WEEKDAY},? (?:the )?(${DATE})`, 'gi'), 1, 2],
    [new RegExp(String.raw`\b(${DATE}),? \(${WEEKDAY}\)`, 'gi'), 2, 1],
  ]
  for (const [re, wd, dt] of forms)
    for (const m of text.matchAll(re)) {
      const key = dateKey(m[dt]!)
      if (key && weekdayOf(key) !== weekdayIndex(m[wd]!)) return m[0]
    }
  return undefined
}

/** Words that state the current day: "It is 10:00 on Wednesday", "today, Wednesday". */
const ASSERT = String.raw`(?:\bit is|\bit's|\bit’s|\bcurrent (?:sim(?:ulated)? |narrative )?time:?|\bnarrative clock:?|\btoday(?: is|,)?|\bthis (?:morning|afternoon|evening),?)`

/** The day a row states as the current one; the first statement wins. */
function statedDay(row: MselRow): Day | undefined {
  const text = row.event
  const within = String.raw`[^.!?\n]{0,40}?`
  // The STARTEX card sets the day wherever it names it; other rows must state it.
  const lead = row.purposeTag === 'STARTEX' ? '' : ASSERT + within
  const wd = new RegExp(String.raw`${lead}\b${WEEKDAY}\b`, 'i').exec(text)
  const dt = new RegExp(String.raw`${lead}\b(${DATE})`, 'i').exec(text)
  if (!wd && !dt) return undefined
  const date = dt ? dateKey(dt[1]!) : undefined
  return {
    ...(wd ? { weekday: weekdayIndex(wd[1]!) } : {}),
    ...(date ? { date } : {}),
    quote: (wd ?? dt)![0].trim(),
  }
}

/**
 * A control card (STARTEX, TIME_JUMP, ENDEX) that sets a weekday and a date apart ("It is
 * Wednesday, 09:00 … April 2, 2026") that do not agree (#364 item 4).
 */
function cardDayMismatch(row: MselRow, day: Day): W | undefined {
  if (!CONTROL.has(row.purposeTag) || day.weekday === undefined || !day.date) return undefined
  if (weekdayOf(day.date) === day.weekday) return undefined
  return warn(
    DATE_DRIFT,
    `Row ${row.id} sets the day as "${day.quote}", but its date, ${longDate(day.date).replace(/^\w+, /, '')}, is a ${capital(WEEKDAYS[weekdayOf(day.date)]!)}`,
    { rowId: row.id, suggestion: `Use "${longDate(day.date)}", or the date of the weekday meant` },
  )
}

/** The one full date the brief's request names, if it names exactly one. */
function briefDate(s: Scenario): string | undefined {
  const text = [s.brief?.userPrompt ?? '', ...(s.brief?.constraints ?? [])].join('\n')
  const keys = new Set(
    [...text.matchAll(new RegExp(String.raw`\b(${DATE})`, 'gi'))]
      .map((m) => dateKey(m[1]!))
      .filter((k): k is string => !!k),
  )
  return keys.size === 1 ? [...keys][0] : undefined
}

/** The STARTEX card's day against the one date the brief names (#364 item 4). */
function startexAgainstBrief(s: Scenario, row: MselRow, day: Day): W | undefined {
  const want = row.purposeTag === 'STARTEX' ? briefDate(s) : undefined
  if (!want) return undefined
  const off = day.date ? day.date !== want : day.weekday !== weekdayOf(want)
  if (!off) return undefined
  return warn(
    DATE_DRIFT,
    `The STARTEX row says "${day.quote}", but the brief sets the exercise on ${longDate(want)}`,
    { rowId: row.id, suggestion: `Set the STARTEX card on ${longDate(want)}` },
  )
}

/** The exercise day and date stay the same between rows unless a time jump moves them (#347 item 3). */
function lintDates(s: Scenario): W[] {
  const out: W[] = []
  let current: Day | undefined
  for (const row of s.msel) {
    const wrong = weekdayDateMismatch(`${row.event}\n${row.expectedAction}`)
    if (wrong) {
      out.push(
        warn(DATE_DRIFT, `Row ${row.id} says "${wrong}", but that date falls on another weekday`, {
          rowId: row.id,
          suggestion: 'Use the weekday that matches the date the STARTEX card sets',
        }),
      )
      continue
    }
    const control = row.purposeTag === 'STARTEX' || row.purposeTag === 'TIME_JUMP'
    const day = statedDay(row)
    if (!day) continue
    const card = cardDayMismatch(row, day) ?? startexAgainstBrief(s, row, day)
    if (card) {
      out.push(card)
      continue
    }
    if (control || !current) {
      current = { ...current, ...day }
      continue
    }
    const otherWeekday =
      day.weekday !== undefined && current.weekday !== undefined && day.weekday !== current.weekday
    const otherDate = !!day.date && !!current.date && day.date !== current.date
    if (!otherWeekday && !otherDate) continue
    out.push(
      warn(
        DATE_DRIFT,
        `Row ${row.id} says "${day.quote}", but the exercise day is "${current.quote}" and no time jump moved it`,
        {
          rowId: row.id,
          suggestion: `Keep the day and date the STARTEX card sets ("${current.quote}"), or add a TIME_JUMP that moves to the new day`,
        },
      ),
    )
  }
  return out
}

// ---- roles --------------------------------------------------------------------------------

/**
 * Outside parties the brief says the SimCell plays: "outside parties (CISA, the FBI, the
 * railroad) are played by the SimCell". Each name without its article.
 */
export function simcellParties(constraints: string[]): string[] {
  const out: string[] = []
  for (const c of constraints) {
    const m = /outside parties\s*\(([^)]+)\)[^.]*?\bsimcell\b/i.exec(c)
    if (!m) continue
    for (const part of m[1]!.split(/,|\band\b/))
      out.push(
        part
          .trim()
          .replace(/^(?:the|a|an)\s+/i, '')
          .trim(),
      )
  }
  return out.filter((p) => p.length >= 3)
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Player roles stay within the brief's audience, and no outside party sits at the table (#347 item 11). */
function lintRoles(s: Scenario): W[] {
  const out: W[] = []
  const audience = s.brief?.audience?.length ?? 0
  // One role over the audience is common in hand-built MSELs (a liaison seat); more is drift.
  if (audience && s.roles.length > audience + 1)
    out.push(
      warn(
        ROLES_EXCEED_AUDIENCE,
        `The scenario has ${s.roles.length} player roles, but the brief's audience lists ${audience}`,
        {
          suggestion:
            'Merge or remove the extra roles so each audience entry has one role; outside parties are played by the SimCell',
        },
      ),
    )
  const parties = simcellParties(s.brief?.constraints ?? [])
  for (const role of s.roles) {
    // "Cybersecurity Coordinator (TSA)" is the company's TSA coordinator, not TSA.
    const label = `${role.name.replace(/\s*\(.*?\)\s*/g, ' ')} ${role.abbreviation}`
    const party = parties.find((p) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(p)}(?![\\p{L}\\p{N}])`, 'iu').test(label),
    )
    if (!party) continue
    out.push(
      warn(
        OUTSIDE_PARTY_ROLE,
        `Player role "${role.name}" is ${party}, an outside party the brief says the SimCell plays`,
        {
          suggestion: `Remove the role and re-address its injects to the player who deals with ${party}; the SimCell plays ${party}`,
        },
      ),
    )
  }
  return out
}

/** Every brief, clock and calendar lint; `profile` gives the role words the audience check uses. */
export function lintBrief(s: Scenario, profile?: DomainProfile): LintWarning[] {
  return [
    ...lintStartTime(s),
    ...lintControlClocks(s),
    ...lintBriefTimes(s),
    ...lintTimeJumps(s),
    ...lintDates(s),
    ...lintRoles(s),
    ...lintAudience(s, profile),
  ]
}

/** Control cards never carry content lints. */
export const isControlRow = (row: MselRow): boolean => CONTROL.has(row.purposeTag)
