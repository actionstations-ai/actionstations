// News cycle simulator (spec 0458 FR-5): a deterministic, seeded model of how coverage of an
// incident develops. Given a trigger time, severity and visibility it schedules the pickup of
// the story by fictional outlets with their deadlines (a wire flash within minutes, local TV at
// the next hour, a web article, a morning print edition), calls and emails from reporters at
// plausible times, and follow-up stories that react to what the organization said or failed to
// say. The result is a list of inject proposals the generator writes up and the facilitator
// adjusts. It is a teaching model: every item is marked simulated.
import { z } from 'zod'
import { between, pick, seeded } from './rng'

/** What the player's organization did, in exercise minutes. */
export const MediaResponse = z.object({
  atMin: z.number().min(0),
  kind: z.enum(['holding_statement', 'correction', 'press_conference', 'reporter_response']),
})
export type MediaResponse = z.infer<typeof MediaResponse>

export const NewsCycleInput = z.object({
  seed: z.number().int(),
  /** Exercise minute of the first public signal. */
  triggerAtMin: z.number().min(0),
  /** Minute of the day (0 to 1439) at exercise minute 0, so "the next hour" is a real hour. */
  startMinuteOfDay: z.number().int().min(0).max(1439).default(480),
  severity: z.number().int().min(1).max(5),
  visibility: z.enum(['local', 'regional', 'national']),
  /** The organization's actions so far; they steer the follow-up stories. */
  responses: z.array(MediaResponse).default([]),
  /** How long without a statement before reporters write "has not commented". */
  silenceAfterMin: z.number().positive().default(60),
})
export type NewsCycleInput = z.input<typeof NewsCycleInput>

export const COVERAGE_KINDS = [
  'wire_flash',
  'wire_bulletin',
  'wire_update',
  'local_tv',
  'web_article',
  'push_alert',
  'print_edition',
  'reporter_call',
  'reporter_email',
  'follow_up',
] as const
export type CoverageKind = (typeof COVERAGE_KINDS)[number]

/** An inject proposal. `injectType` is an existing or toolkit template the generator can use. */
export interface CoverageItem {
  id: string
  atMin: number
  kind: CoverageKind
  outlet: string
  injectType: string
  /** The reporter's or the outlet's deadline, in exercise minutes, when it has one. */
  deadlineMin?: number
  /** What the item covers, for the generator to write up. */
  brief: string
  /** Why the model scheduled it, shown to the facilitator. */
  reason: string
  simulated: true
}

/** Fictional outlets only (naming rule). None imitates a real outlet. */
export const FICTIONAL_OUTLETS = {
  wire: ['Meridian Wire', 'Continental Wire Service'],
  tv: ['Harborview 7 News', 'Channel 12 Action News (fictional)'],
  web: ['The Lakeshore Courier', 'Tri-County Dispatch Online'],
  print: ['The Lakeshore Courier', 'Tri-County Dispatch'],
  radio: ['WMRD News Radio (fictional)'],
} as const

const DAY = 1440

/** Number of reporter contacts: more for a bigger, wider story. */
export function reporterContactCount(severity: number, visibility: string): number {
  const reach = visibility === 'national' ? 3 : visibility === 'regional' ? 2 : 1
  return Math.min(8, severity + reach - 1)
}

type Draft = Omit<CoverageItem, 'id' | 'simulated'>

function wireItems(input: z.output<typeof NewsCycleInput>, rand: () => number): Draft[] {
  const t = input.triggerAtMin
  const wire = pick(rand, FICTIONAL_OUTLETS.wire)
  if (input.severity < 2 && input.visibility === 'local') return []
  const flash = t + between(rand, 2, 6)
  return [
    {
      atMin: flash,
      kind: 'wire_flash',
      outlet: wire,
      injectType: 'wire_alert',
      brief: 'One-line flash: what happened, where, source named.',
      reason: 'A wire flash follows a significant event within minutes.',
    },
    {
      atMin: flash + between(rand, 7, 14),
      kind: 'wire_bulletin',
      outlet: wire,
      injectType: 'wire_alert',
      brief: 'Bulletin with the first confirmed details and who was asked for comment.',
      reason: 'The wire follows a flash with a bulletin as details arrive.',
    },
  ]
}

function broadcastItems(input: z.output<typeof NewsCycleInput>, rand: () => number): Draft[] {
  const t = input.triggerAtMin
  const items: Draft[] = []
  const toNextHour = 60 - (((input.startMinuteOfDay + t) % DAY) % 60)
  // A newscast less than 15 minutes away cannot take the story; the next one does.
  const tvAt = t + (toNextHour < 15 ? toNextHour + 60 : toNextHour)
  const tvOutlet = pick(rand, FICTIONAL_OUTLETS.tv)
  items.push({
    atMin: Math.max(tvAt, t + 10),
    kind: 'local_tv',
    outlet: tvOutlet,
    injectType: 'broadcast_rundown',
    deadlineMin: Math.max(tvAt, t + 10) - 15,
    brief: 'Rundown slot and segment script for the top-of-the-hour newscast.',
    reason:
      'Local TV picks the story up at the next hour; the producer needs comment 15 minutes before.',
  })
  const webAt = t + between(rand, 20, 45)
  items.push({
    atMin: webAt,
    kind: 'web_article',
    outlet: pick(rand, FICTIONAL_OUTLETS.web),
    injectType: 'news_article',
    deadlineMin: webAt - 10,
    brief: 'Web article with headline, lede and attributed claims.',
    reason: 'A web article posts within the hour and is updated as facts change.',
  })
  if (input.severity >= 3)
    items.push({
      atMin: webAt + between(rand, 2, 8),
      kind: 'push_alert',
      outlet: pick(rand, FICTIONAL_OUTLETS.web),
      injectType: 'news_article',
      brief: 'Push alert: one sentence with the outlet name and a time.',
      reason: 'A severe story gets a push alert when the web article posts.',
    })
  const evening = 21 * 60 - input.startMinuteOfDay
  const printAt = evening > t ? evening + 8 * 60 : t + 12 * 60
  items.push({
    atMin: printAt,
    kind: 'print_edition',
    outlet: pick(rand, FICTIONAL_OUTLETS.print),
    injectType: 'news_article',
    deadlineMin: printAt - 8 * 60,
    brief: 'Morning print edition story, with what the organization said by the print deadline.',
    reason: 'The morning edition closes in the evening and appears the next morning.',
  })
  return items
}

function reporterItems(input: z.output<typeof NewsCycleInput>, rand: () => number): Draft[] {
  const count = reporterContactCount(input.severity, input.visibility)
  const items: Draft[] = []
  let at = input.triggerAtMin + between(rand, 8, 20)
  for (let i = 0; i < count; i++) {
    const call = rand() < 0.55
    const deadline = at + between(rand, 25, 90)
    items.push({
      atMin: at,
      kind: call ? 'reporter_call' : 'reporter_email',
      outlet: pick(rand, [
        ...FICTIONAL_OUTLETS.wire,
        ...FICTIONAL_OUTLETS.tv,
        ...FICTIONAL_OUTLETS.web,
        ...FICTIONAL_OUTLETS.radio,
      ]),
      injectType: call ? 'media_inquiry_phone_slip' : 'reporter_email',
      deadlineMin: deadline,
      brief:
        i === 0
          ? 'First inquiry: asks what happened and for a statement.'
          : 'Follow-up inquiry with a sharper question and a deadline.',
      reason: 'Reporters call and email in waves; each states a deadline.',
    })
    at += between(rand, 10, 35)
  }
  return items
}

function followUps(input: z.output<typeof NewsCycleInput>, rand: () => number): Draft[] {
  const t = input.triggerAtMin
  const out: Draft[] = []
  const statements = input.responses
    .filter((r) => r.kind === 'holding_statement')
    .sort((a, b) => a.atMin - b.atMin)
  const first = statements[0]
  const web = pick(rand, FICTIONAL_OUTLETS.web)
  if (!first || first.atMin - t > input.silenceAfterMin) {
    out.push({
      atMin: t + input.silenceAfterMin + between(rand, 10, 25),
      kind: 'follow_up',
      outlet: web,
      injectType: 'news_article',
      brief: 'Story noting the organization had not commented by the deadline.',
      reason: first
        ? 'The first statement came after the silence threshold.'
        : 'No holding statement was issued.',
    })
  }
  if (first)
    out.push({
      atMin: first.atMin + between(rand, 20, 40),
      kind: 'follow_up',
      outlet: web,
      injectType: 'news_article',
      brief: 'Updated story that quotes the holding statement and what it left unanswered.',
      reason: 'Coverage reacts to what the organization said.',
    })
  for (const c of input.responses.filter((r) => r.kind === 'correction'))
    out.push({
      atMin: c.atMin + between(rand, 15, 40),
      kind: 'wire_update',
      outlet: pick(rand, FICTIONAL_OUTLETS.wire),
      injectType: 'wire_alert',
      brief: 'Wire update carrying the correction and the earlier error.',
      reason: 'A correction is picked up and reported alongside the original error.',
    })
  for (const p of input.responses.filter((r) => r.kind === 'press_conference'))
    out.push({
      atMin: p.atMin + between(rand, 10, 30),
      kind: 'follow_up',
      outlet: pick(rand, FICTIONAL_OUTLETS.tv),
      injectType: 'news_article',
      brief: 'Coverage of the press conference, leading with the hardest question.',
      reason: 'A press conference produces same-day coverage.',
    })
  return out
}

/** The coverage schedule, sorted by time, with stable ids. Same input, same output. */
export function newsCycleSchedule(raw: NewsCycleInput): CoverageItem[] {
  const input = NewsCycleInput.parse(raw)
  const rand = seeded(input.seed)
  const drafts = [
    ...wireItems(input, rand),
    ...broadcastItems(input, rand),
    ...reporterItems(input, rand),
    ...followUps(input, rand),
  ]
  drafts.sort((a, b) => a.atMin - b.atMin || a.kind.localeCompare(b.kind))
  return drafts.map((d, i) => ({
    ...d,
    id: `news-${String(i + 1).padStart(2, '0')}`,
    simulated: true as const,
  }))
}
