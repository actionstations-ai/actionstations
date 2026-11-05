// Media environment figure kinds (spec 0458 FR-6, NFR-3): spread over time, sentiment mix,
// narrative volume and a coverage timeline. Each draws through a generic kind (time series, stacked
// bar, bar, annotated timeline), puts "Simulated" in the title and the summary, and so keeps the
// generic kinds' text summary, data table and non-color cues.
import { z } from 'zod'
import { annotatedTimelineKind } from '../annotated-timeline'
import { barKind, stackedBarKind } from '../bar'
import { registerFigureKind } from '../registry'
import { timeSeriesKind } from '../time-series'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

const NOTE = 'Simulated by a teaching model; it does not predict real spread or coverage.'
const titled = (t: string | undefined, fallback: string): string => `Simulated: ${t ?? fallback}`

function simulated<D, G>(
  kind: string,
  schema: z.ZodType<D>,
  generic: FigureKind<G>,
  convert: (d: D) => G,
  defaultHeight?: number,
): FigureKind<D> {
  return {
    kind,
    schema,
    ...(defaultHeight ? { defaultHeight } : {}),
    render(d: D, o: FigureOptions): FigureResult {
      const r = generic.render(generic.schema.parse(convert(d)), o)
      const table = r.table
        ? { ...r.table, caption: `${r.table.caption ?? 'Data'} (simulated)` }
        : undefined
      return { svg: r.svg, summary: `${r.summary} ${NOTE}`, ...(table ? { table } : {}) }
    },
  }
}

const Title = z.string().max(200).optional()

export const SpreadData = z.object({
  title: Title,
  points: z
    .array(
      z.object({
        atMin: z.number().min(0),
        views: z.number().min(0),
        viewsUnanswered: z.number().min(0),
      }),
    )
    .min(2)
    .max(1000),
  responses: z
    .array(z.object({ atMin: z.number().min(0), label: z.string().min(1).max(100) }))
    .max(9)
    .default([]),
})
export type SpreadData = z.infer<typeof SpreadData>

export const spreadKind = simulated('media.spread', SpreadData, timeSeriesKind, (d) => ({
  title: titled(d.title, 'Views over time'),
  xLabel: 'Minutes since the post appeared',
  yLabel: 'Views',
  series: [
    { name: 'With your responses', points: d.points.map((p) => ({ x: p.atMin, y: p.views })) },
    {
      name: 'If nobody answered',
      points: d.points.map((p) => ({ x: p.atMin, y: p.viewsUnanswered })),
    },
  ],
  thresholds: [],
  annotations: d.responses.map((r) => ({ x: r.atMin, label: r.label })),
}))

const Bucket = z.object({
  label: z.string().min(1).max(40),
  supportive: z.number().int().min(0),
  skeptical: z.number().int().min(0),
  hostile: z.number().int().min(0),
  false_claim: z.number().int().min(0),
  joke: z.number().int().min(0),
})

export const SentimentData = z.object({ title: Title, buckets: z.array(Bucket).min(1).max(24) })
export type SentimentData = z.infer<typeof SentimentData>

export const sentimentKind = simulated('media.sentiment', SentimentData, stackedBarKind, (d) => ({
  title: titled(d.title, 'Reply sentiment'),
  yLabel: 'Replies',
  categories: d.buckets.map((b) => b.label),
  series: [
    ['Supportive', 'supportive'],
    ['Skeptical', 'skeptical'],
    ['Hostile', 'hostile'],
    ['False claim', 'false_claim'],
    ['Joke', 'joke'],
  ].map(([name, key]) => ({
    name: name!,
    values: d.buckets.map((b) => b[key as keyof typeof b] as number),
  })),
}))

export const NarrativesData = z.object({
  title: Title,
  narratives: z
    .array(
      z.object({
        label: z.string().min(1).max(50),
        volume: z.number().min(0),
        isFalse: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(12),
})
export type NarrativesData = z.infer<typeof NarrativesData>

export const narrativesKind = simulated('media.narratives', NarrativesData, barKind, (d) => ({
  title: titled(d.title, 'Top narratives'),
  yLabel: 'Posts',
  bars: d.narratives.map((n) => ({
    label: n.isFalse ? `${n.label} (false claim)` : n.label,
    value: n.volume,
  })),
}))

export const CoverageData = z.object({
  title: Title,
  items: z
    .array(
      z.object({
        atMin: z.number().min(0),
        label: z.string().min(1).max(120),
        lane: z.string().min(1).max(40),
      }),
    )
    .min(1)
    .max(30),
})
export type CoverageData = z.infer<typeof CoverageData>

export const coverageTimelineKind = simulated(
  'media.coverage_timeline',
  CoverageData,
  annotatedTimelineKind,
  (d) => ({
    title: titled(d.title, 'Coverage timeline'),
    xLabel: 'Minutes into the exercise',
    lanes: [...new Set(d.items.map((i) => i.lane))].slice(0, 8),
    events: d.items.map((i) => ({ x: i.atMin, label: i.label, lane: i.lane })),
    spans: [],
  }),
)

registerFigureKind(spreadKind)
registerFigureKind(sentimentKind)
registerFigureKind(narrativesKind)
registerFigureKind(coverageTimelineKind)
