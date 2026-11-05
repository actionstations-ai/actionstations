// Social spread and sentiment simulator (spec 0458 FR-6). A post's counters grow along a logistic
// curve from the minute it appears; a response changes the growth that comes after it by
// documented fractions. The parameters are simple and shown to the facilitator. This is a
// teaching model: it does not predict real spread, and everything it produces is simulated.
import { z } from 'zod'
import { seeded } from './rng'

/** The documented response parameters (shown on the facilitator's spread card). */
export const SPREAD_PARAMETERS = {
  /** A response this soon after the post appears is timely (minutes). */
  timelyWithinMin: 60,
  /** A response later than timely but within this is late (minutes); after it, very late. */
  lateWithinMin: 240,
  /** Share of FURTHER growth removed, by response kind and timing: [timely, late, very late]. */
  reduction: {
    correction: [0.4, 0.15, 0.05],
    label: [0.3, 0.1, 0.03],
    takedown: [0.5, 0.2, 0.08],
  },
  /** Growth never drops below this share of the unanswered curve, however many responses. */
  growthFloor: 0.35,
  /** Silence this long after the post appears makes hostile replies likelier (minutes). */
  silenceHostileAfterMin: 120,
} as const

export const SENTIMENTS = ['supportive', 'skeptical', 'hostile', 'false_claim', 'joke'] as const
export type Sentiment = (typeof SENTIMENTS)[number]

export const SpreadResponse = z.object({
  /** Minutes after the post appeared. */
  atMin: z.number().min(0),
  kind: z.enum(['correction', 'label', 'takedown', 'statement']),
})
export type SpreadResponse = z.infer<typeof SpreadResponse>

const Mix = z.object({
  supportive: z.number().min(0),
  skeptical: z.number().min(0),
  hostile: z.number().min(0),
  false_claim: z.number().min(0),
  joke: z.number().min(0),
})

export const DEFAULT_MIX = {
  supportive: 0.25,
  skeptical: 0.25,
  hostile: 0.15,
  false_claim: 0.25,
  joke: 0.1,
}

export const Narrative = z.object({
  label: z.string().min(1).max(120),
  /** Relative size of the narrative among replies. */
  weight: z.number().positive(),
  /** A false narrative is slowed by corrections; a true one is not. */
  isFalse: z.boolean().default(false),
})
export type Narrative = z.infer<typeof Narrative>

export const SpreadParams = z.object({
  seed: z.number().int(),
  /** Views the post reaches in the end if nobody answers. */
  reach: z.number().int().min(1).max(100_000_000),
  /** Minutes after the post appears at which growth is fastest. */
  peakAtMin: z.number().positive().max(2880),
  /** Steepness of the curve per minute; larger means a sharper surge. */
  rate: z.number().positive().optional(),
  likeRate: z.number().min(0).max(1).default(0.03),
  repostRate: z.number().min(0).max(1).default(0.01),
  replyRate: z.number().min(0).max(1).default(0.004),
  mix: Mix.default(DEFAULT_MIX),
  narratives: z.array(Narrative).max(8).default([]),
  responses: z.array(SpreadResponse).default([]),
})
export type SpreadParams = z.input<typeof SpreadParams>
type Parsed = z.output<typeof SpreadParams>

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x))

/** Share of final reach seen by `t` minutes with no response: 0 at 0 and tending to 1. */
export function baseFraction(t: number, peakAtMin: number, rate?: number): number {
  if (t <= 0) return 0
  const r = rate ?? 4 / peakAtMin
  const low = sigmoid(-r * peakAtMin)
  return (sigmoid(r * (t - peakAtMin)) - low) / (1 - low)
}

function reductionOf(kind: SpreadResponse['kind'], atMin: number): number {
  if (kind === 'statement') return 0
  const tiers = SPREAD_PARAMETERS.reduction[kind]
  if (atMin <= SPREAD_PARAMETERS.timelyWithinMin) return tiers[0]
  return atMin <= SPREAD_PARAMETERS.lateWithinMin ? tiers[1] : tiers[2]
}

/** Responses in time order. */
const ordered = (rs: SpreadResponse[]): SpreadResponse[] =>
  [...rs].sort((a, b) => a.atMin - b.atMin)

/**
 * Fraction of final reach seen by `t`, with the responses applied: each response removes a share
 * of the growth that comes after it, and the total slowdown stops at the floor. The fraction
 * never decreases.
 */
export function spreadFraction(p: Parsed, t: number, answered = true): number {
  let done = 0
  let from = 0
  let factor = 1
  const stops = answered ? ordered(p.responses).filter((r) => r.atMin < t) : []
  for (const r of stops) {
    done +=
      (baseFraction(r.atMin, p.peakAtMin, p.rate) - baseFraction(from, p.peakAtMin, p.rate)) *
      factor
    from = r.atMin
    factor = Math.max(SPREAD_PARAMETERS.growthFloor, factor * (1 - reductionOf(r.kind, r.atMin)))
  }
  return (
    done + (baseFraction(t, p.peakAtMin, p.rate) - baseFraction(from, p.peakAtMin, p.rate)) * factor
  )
}

/** Weights of the five reply kinds at `t`, after the response modifiers, summing to 1. */
export function sentimentWeights(p: Parsed, t: number): Record<Sentiment, number> {
  const w = { ...p.mix }
  const corrections = p.responses.filter((r) => r.kind === 'correction' && r.atMin <= t)
  const first = corrections.sort((a, b) => a.atMin - b.atMin)[0]
  if (first) {
    const timely = first.atMin <= SPREAD_PARAMETERS.timelyWithinMin
    w.false_claim *= timely ? 0.6 : 0.85
    w.skeptical *= timely ? 1.1 : 1.03
  }
  const answered = p.responses.some((r) => r.atMin <= SPREAD_PARAMETERS.silenceHostileAfterMin)
  if (!answered && t > SPREAD_PARAMETERS.silenceHostileAfterMin) w.hostile *= 1.3
  const total = SENTIMENTS.reduce((n, s) => n + w[s], 0) || 1
  return Object.fromEntries(SENTIMENTS.map((s) => [s, w[s] / total])) as Record<Sentiment, number>
}

/** Split `total` replies by weight with the largest-remainder rule, so the parts add up. */
export function apportion<K extends string>(
  total: number,
  weights: Record<K, number>,
): Record<K, number> {
  const keys = Object.keys(weights) as K[]
  const raw = keys.map((k) => ({ k, v: weights[k] * total }))
  const out = Object.fromEntries(raw.map(({ k, v }) => [k, Math.floor(v)])) as Record<K, number>
  let left = total - raw.reduce((n, { v }) => n + Math.floor(v), 0)
  const byRemainder = [...raw].sort(
    (a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || a.k.localeCompare(b.k),
  )
  for (const { k } of byRemainder) {
    if (left <= 0) break
    out[k] += 1
    left -= 1
  }
  return out
}

export interface SpreadState {
  atMin: number
  views: number
  likes: number
  reposts: number
  replies: number
  sentiment: Record<Sentiment, number>
  narratives: { label: string; volume: number; isFalse: boolean }[]
  /** Views the post would have without any response, for comparison. */
  viewsUnanswered: number
  simulated: true
}

/** Counters and sentiment `atMin` minutes after the post appeared. */
export function spreadAt(raw: SpreadParams, atMin: number): SpreadState {
  const p = SpreadParams.parse(raw)
  // A seed-fixed jitter on the engagement rates, so two posts of one scenario differ a little.
  const jitter = 0.9 + seeded(p.seed)() * 0.2
  const views = Math.floor(p.reach * spreadFraction(p, atMin))
  const replies = Math.floor(views * p.replyRate * jitter)
  const weights = Math.max(
    1,
    p.narratives.reduce((n, x) => n + x.weight, 0),
  )
  return {
    atMin,
    views,
    likes: Math.floor(views * p.likeRate * jitter),
    reposts: Math.floor(views * p.repostRate * jitter),
    replies,
    sentiment: apportion(replies, sentimentWeights(p, atMin)),
    narratives: p.narratives.map((n) => {
      const frac = spreadFraction(p, atMin, n.isFalse)
      return {
        label: n.label,
        isFalse: n.isFalse,
        volume: Math.floor(p.reach * frac * p.replyRate * jitter * (n.weight / weights)),
      }
    }),
    viewsUnanswered: Math.floor(p.reach * spreadFraction(p, atMin, false)),
    simulated: true,
  }
}

/** States every `stepMin` minutes from 0 to `untilMin` inclusive. */
export function spreadSeries(raw: SpreadParams, stepMin: number, untilMin: number): SpreadState[] {
  const out: SpreadState[] = []
  for (let t = 0; t <= untilMin; t += stepMin) out.push(spreadAt(raw, t))
  return out
}

/** A social listening report at one moment: volume, sentiment mix and the top narratives. */
export interface ListeningReport {
  atMin: number
  volume: number
  sentiment: { label: Sentiment; count: number; share: number }[]
  topNarratives: { label: string; volume: number; isFalse: boolean }[]
  simulated: true
}

export function listeningReport(raw: SpreadParams, atMin: number): ListeningReport {
  const s = spreadAt(raw, atMin)
  const total = Math.max(1, s.replies)
  return {
    atMin,
    volume: s.views,
    sentiment: SENTIMENTS.map((label) => ({
      label,
      count: s.sentiment[label],
      share: s.sentiment[label] / total,
    })),
    topNarratives: [...s.narratives]
      .sort((a, b) => b.volume - a.volume || a.label.localeCompare(b.label))
      .slice(0, 5),
    simulated: true,
  }
}

/** Counts in the shape the engagement fields of the social templates take (spec 0428). */
export function engagementCounts(state: SpreadState): Record<string, number> {
  return {
    views: state.views,
    likes: state.likes,
    reposts: state.reposts,
    replies: state.replies,
    comments: state.replies,
    shares: state.reposts,
    reactions: state.likes,
    upvotes: state.likes,
  }
}
