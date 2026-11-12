// The media environment toolkit's app code (spec 0458): the news cycle and social spread
// simulators, their case-data generators (the framework labels the output simulated) and the
// bridge to the engagement fields of the social templates (spec 0428).
import { z } from 'zod'
import { ENGAGEMENT_FIELDS } from '@shared/facilitator/engagement-fields'
import { applyEngagement } from '@shared/facilitator/engagement'
import { generatorIds, registerGenerator, type GeneratedDataset } from '../../case-data/generators'
import { registerGdeltConnector } from '../connectors/gdelt'
import { newsCycleSchedule, NewsCycleInput } from './news-cycle'
import { engagementCounts, spreadSeries, SpreadParams, type SpreadState } from './spread'

export * from './news-cycle'
export * from './spread'

/**
 * The fields of a social post with the counters of `state` written through the template's
 * engagement map. A type with no map is returned unchanged. Never mutates its input.
 */
export function applySpreadToFields(
  type: string,
  fields: Record<string, unknown>,
  state: SpreadState,
): Record<string, unknown> {
  const map = ENGAGEMENT_FIELDS[type]
  if (!map) return structuredClone(fields)
  const counts = engagementCounts(state)
  const names = Object.keys(map.metrics)
  const pick = Object.fromEntries(names.map((n) => [n, counts[n] ?? 0]))
  return applyEngagement(
    fields,
    { curve: 'steady', start: pick, peak: pick, peakAtMin: 1, replies: [] },
    map,
    0,
  )
}

const iso = (startAt: string, min: number): string =>
  new Date(Date.parse(startAt) + min * 60_000).toISOString()

const SpreadGeneratorParams = z.object({
  startAt: z.string().datetime(),
  stepMin: z.number().int().min(1).max(240).default(10),
  untilMin: z.number().int().min(1).max(4320).default(720),
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,40}$/)
    .default('social-spread'),
  spread: SpreadParams,
})

function generateSpread(p: z.output<typeof SpreadGeneratorParams>): GeneratedDataset[] {
  const states = spreadSeries(p.spread, p.stepMin, p.untilMin)
  return [
    {
      id: `${p.id}-counters`,
      label: 'Simulated social counters',
      kind: 'series',
      unit: 'count',
      range: { start: p.startAt, end: iso(p.startAt, p.untilMin) },
      data: states.map((s) => ({
        t: iso(p.startAt, s.atMin),
        v: {
          views: s.views,
          likes: s.likes,
          reposts: s.reposts,
          replies: s.replies,
          viewsUnanswered: s.viewsUnanswered,
        },
      })),
    },
    {
      id: `${p.id}-sentiment`,
      label: 'Simulated reply sentiment',
      kind: 'series',
      unit: 'replies',
      range: { start: p.startAt, end: iso(p.startAt, p.untilMin) },
      data: states.map((s) => ({ t: iso(p.startAt, s.atMin), v: { ...s.sentiment } })),
    },
  ]
}

const NewsGeneratorParams = z.object({
  startAt: z.string().datetime(),
  news: NewsCycleInput,
})

function generateNews(p: z.output<typeof NewsGeneratorParams>): GeneratedDataset[] {
  const schedule = newsCycleSchedule(p.news)
  return [
    {
      id: 'news-cycle-schedule',
      label: 'Simulated news cycle schedule',
      kind: 'text',
      data: schedule.map((i) => ({
        t: iso(p.startAt, i.atMin),
        title: `${i.outlet}: ${i.kind.replace('_', ' ')}`,
        text: `${i.brief} (${i.reason})${i.deadlineMin !== undefined ? ` Deadline ${iso(p.startAt, i.deadlineMin)}.` : ''}`,
      })),
    },
  ]
}

/** What the media metrics compare decisions with (spec 0458 FR-9). */
export const MEDIA_GROUND_TRUTH_ID = 'media-ground-truth'

const ErrorSpec = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,40}$/),
  atMin: z.number().min(0),
  /** The channel the error spread on (a correction should go out on the same one). */
  channel: z.string().max(60).default('Website'),
  label: z.string().max(200).default('An error in coverage or in a statement'),
})
const ItemSpec = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,40}$/),
  atMin: z.number().min(0),
  truth: z.enum([
    'authentic',
    'misattributed',
    'manipulated',
    'synthetic',
    'satire',
    'unverifiable',
  ]),
  label: z.string().max(200).default('An item to verify'),
})

const GroundTruthGeneratorParams = z.object({
  startAt: z.string().datetime(),
  news: NewsCycleInput,
  /** Errors found during the exercise; one on the first web article when omitted. */
  errors: z.array(ErrorSpec).max(20).optional(),
  /** Items to verify; one false and one authentic video when omitted. */
  items: z.array(ItemSpec).max(20).optional(),
})

/**
 * The simulated ground truth the media metrics read: the first public signal, the reporter
 * queries (with their deadlines) from the news cycle schedule, errors found, and verification
 * items with their hidden truth. Players reference a query, error or item by its id.
 */
export function generateMediaGroundTruth(
  p: z.output<typeof GroundTruthGeneratorParams>,
): GeneratedDataset[] {
  const schedule = newsCycleSchedule(p.news)
  const t = p.news.triggerAtMin
  const web = schedule.find((i) => i.kind === 'web_article')
  const errors = p.errors ?? [
    {
      id: 'error-1',
      atMin: (web?.atMin ?? t + 30) + 30,
      channel: 'Website',
      label: `A claim in the ${web?.outlet ?? 'web'} article does not match the fact sheet`,
    },
  ]
  const items = p.items ?? [
    {
      id: 'item-1',
      atMin: t + 25,
      truth: 'misattributed' as const,
      label: 'Viewer video said to show the incident',
    },
    {
      id: 'item-2',
      atMin: t + 40,
      truth: 'authentic' as const,
      label: 'Photo from an employee on site',
    },
  ]
  const events = [
    {
      id: 'signal-1',
      time: iso(p.startAt, t),
      kind: 'first_public_signal',
      attrs: { label: 'First public signal' },
    },
    ...schedule
      .filter((i) => i.kind === 'reporter_call' || i.kind === 'reporter_email')
      .map((i) => ({
        id: i.id,
        time: iso(p.startAt, i.atMin),
        kind: 'reporter_query',
        attrs: {
          outlet: i.outlet,
          label: i.brief,
          ...(i.deadlineMin !== undefined ? { deadline: iso(p.startAt, i.deadlineMin) } : {}),
        },
      })),
    ...errors.map((e) => ({
      id: e.id,
      time: iso(p.startAt, e.atMin),
      kind: 'error_found',
      attrs: { channel: e.channel, label: e.label },
    })),
    ...items.map((i) => ({
      id: i.id,
      time: iso(p.startAt, i.atMin),
      kind: 'verification_item',
      attrs: { truth: i.truth, label: i.label },
    })),
  ].sort((a, b) => Date.parse(a.time) - Date.parse(b.time) || a.id.localeCompare(b.id))
  return [
    {
      id: MEDIA_GROUND_TRUTH_ID,
      label: 'Simulated media ground truth',
      kind: 'reports',
      range: { start: p.startAt, end: iso(p.startAt, t + 360) },
      data: events,
    },
  ]
}

/** Register the media generators once; the app calls this at startup. */
export function registerMediaToolkit(): void {
  registerGdeltConnector()
  const have = new Set(generatorIds())
  if (!have.has('media-social-spread'))
    registerGenerator({
      id: 'media-social-spread',
      label: 'Media environment: simulated social spread and sentiment',
      params: SpreadGeneratorParams,
      description:
        "Grows one post's views, likes, reposts and replies along a curve, slowed by the corrections, labels or takedowns you add. Writes the counters and the reply sentiment mix as time series.",
      toolkits: ['media_environment'],
      example: {
        startAt: '2026-11-03T12:00:00Z',
        stepMin: 10,
        untilMin: 720,
        id: 'social-spread',
        spread: {
          seed: 3,
          reach: 100000,
          peakAtMin: 90,
          likeRate: 0.03,
          repostRate: 0.01,
          replyRate: 0.004,
          narratives: [
            { label: 'The plant is hiding a leak', weight: 2, isFalse: true },
            { label: 'Roads near the plant are closed', weight: 1, isFalse: false },
          ],
          responses: [{ atMin: 40, kind: 'correction' }],
        },
      } satisfies z.input<typeof SpreadGeneratorParams>,
      fields: {
        startAt: {
          label: 'Post appears (UTC)',
          help: 'When the post goes up; minute 0 of the series.',
        },
        stepMin: { label: 'Step (minutes)', help: 'Minutes between points, 1 to 240.' },
        untilMin: {
          label: 'Length (minutes)',
          help: 'How long to follow the post, up to 4320 (three days).',
        },
        id: {
          label: 'Dataset name',
          help: 'Lowercase letters, digits and hyphens; the datasets are named <name>-counters and <name>-sentiment.',
        },
        spread: {
          label: 'Spread settings',
          help: 'seed (integer), reach (views if nobody answers), peakAtMin (minute of fastest growth), optional rate, likeRate, repostRate and replyRate (0 to 1), mix of reply sentiment, narratives (label, weight, isFalse) and responses (atMin minutes after the post, kind: correction, label, takedown or statement).',
        },
      },
      generate: generateSpread,
    })
  if (!have.has('media-ground-truth'))
    registerGenerator({
      id: 'media-ground-truth',
      label: 'Media environment: simulated ground truth for the communications metrics',
      params: GroundTruthGeneratorParams,
      description:
        'Writes the events the communications measures compare decisions with: the first public signal, reporter queries with their deadlines from the news cycle, errors found in coverage, and items to verify with their hidden truth.',
      toolkits: ['media_environment'],
      example: {
        startAt: '2026-11-03T12:00:00Z',
        news: {
          seed: 11,
          triggerAtMin: 30,
          startMinuteOfDay: 480,
          severity: 4,
          visibility: 'regional',
          responses: [{ atMin: 75, kind: 'holding_statement' }],
          silenceAfterMin: 60,
        },
        errors: [
          {
            id: 'error-1',
            atMin: 120,
            channel: 'Website',
            label: 'Evacuation radius misstated in the web article',
          },
        ],
        items: [
          {
            id: 'item-1',
            atMin: 55,
            truth: 'misattributed',
            label: 'Viewer video said to show the incident',
          },
          { id: 'item-2', atMin: 70, truth: 'authentic', label: 'Photo from an employee on site' },
        ],
      } satisfies z.input<typeof GroundTruthGeneratorParams>,
      fields: {
        startAt: {
          label: 'Exercise start (UTC)',
          help: 'Exercise minute 0; every minute below counts from it.',
        },
        news: {
          label: 'News cycle settings',
          help: 'seed (integer), triggerAtMin (exercise minute of the first public signal), startMinuteOfDay (0 to 1439 at exercise minute 0), severity (1 to 5), visibility (local, regional or national), responses (atMin, kind: holding_statement, correction, press_conference or reporter_response) and silenceAfterMin.',
        },
        errors: {
          label: 'Errors found',
          help: 'Each item: id, atMin (exercise minute), channel the error spread on, label. Leave empty for one error on the first web article.',
        },
        items: {
          label: 'Items to verify',
          help: 'Each item: id, atMin (exercise minute), truth (authentic, misattributed, manipulated, synthetic, satire or unverifiable), label. Leave empty for one misattributed video and one authentic photo.',
        },
      },
      generate: generateMediaGroundTruth,
    })
  if (!have.has('media-news-cycle'))
    registerGenerator({
      id: 'media-news-cycle',
      label: 'Media environment: simulated news cycle',
      params: NewsGeneratorParams,
      description:
        'Schedules how coverage of an incident develops from the first public signal: wire items, local TV, a web article, the print edition, reporter calls and emails with deadlines, and follow-ups that react to your responses. Writes the schedule as dated text entries.',
      toolkits: ['media_environment'],
      example: {
        startAt: '2026-11-03T12:00:00Z',
        news: {
          seed: 11,
          triggerAtMin: 30,
          startMinuteOfDay: 480,
          severity: 4,
          visibility: 'regional',
          responses: [{ atMin: 75, kind: 'holding_statement' }],
          silenceAfterMin: 60,
        },
      } satisfies z.input<typeof NewsGeneratorParams>,
      fields: {
        startAt: {
          label: 'Exercise start (UTC)',
          help: 'Exercise minute 0; every minute in the settings counts from it.',
        },
        news: {
          label: 'News cycle settings',
          help: 'seed (integer), triggerAtMin (exercise minute of the first public signal), startMinuteOfDay (0 to 1439 at exercise minute 0), severity (1 to 5), visibility (local, regional or national), responses (atMin, kind: holding_statement, correction, press_conference or reporter_response) and silenceAfterMin.',
        },
      },
      generate: generateNews,
    })
}
