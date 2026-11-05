// The media environment toolkit's app code (spec 0458): the news cycle and social spread
// simulators, their case-data generators (the framework labels the output simulated) and the
// bridge to the engagement fields of the social templates (spec 0428).
import { z } from 'zod'
import { ENGAGEMENT_FIELDS } from '@shared/facilitator/engagement-fields'
import { applyEngagement } from '@shared/facilitator/engagement'
import { generatorIds, registerGenerator, type GeneratedDataset } from '../../case-data/generators'
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

/** Register the media generators once; the app calls this at startup. */
export function registerMediaToolkit(): void {
  const have = new Set(generatorIds())
  if (!have.has('media-social-spread'))
    registerGenerator({
      id: 'media-social-spread',
      label: 'Media environment: simulated social spread and sentiment',
      params: SpreadGeneratorParams,
      generate: generateSpread,
    })
  if (!have.has('media-news-cycle'))
    registerGenerator({
      id: 'media-news-cycle',
      label: 'Media environment: simulated news cycle',
      params: NewsGeneratorParams,
      generate: generateNews,
    })
}
