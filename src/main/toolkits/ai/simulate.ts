// Simulated AI incident data (spec 0467, design "Simulation"): an evaluation series with a
// changepoint, moderation queue volumes, detector scores whose classes overlap so errors exist,
// and a payment timeline. Simple parametric code with a seeded random source: the same
// parameters give the same data. Nothing here is a model of a real system and every label that
// reaches a user says simulated.
import { between, seeded } from '../media/rng'

/** A normal draw (Box-Muller) from a uniform source. */
function normal(rand: () => number, mean: number, sd: number): number {
  const u = Math.max(rand(), 1e-9)
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
}

const round = (v: number, places = 2): number => {
  const f = 10 ** places
  return Math.round(v * f) / f
}

// ---- evaluation series with a changepoint --------------------------------------------------

export interface EvalSeriesParams {
  seed: number
  days: number
  /** Harmful-output rate before the change, in percent of sampled outputs. */
  baseRatePct: number
  /** The rate after the change, in percent. */
  shiftedRatePct: number
  /** Zero-based day the change starts; the rate climbs over `rampDays` days. */
  changeDay: number
  rampDays: number
  noisePct: number
}

export interface EvalPoint {
  /** Day index, zero-based. */
  x: number
  /** Harmful-output rate, percent. */
  y: number
}

/** A daily harmful-output rate with noise, flat until the changepoint and then rising. */
export function evaluationSeries(p: EvalSeriesParams): EvalPoint[] {
  const rand = seeded(p.seed)
  const out: EvalPoint[] = []
  for (let day = 0; day < p.days; day++) {
    const t = p.rampDays <= 0 ? 1 : Math.min(1, Math.max(0, (day - p.changeDay + 1) / p.rampDays))
    const level = p.baseRatePct + (p.shiftedRatePct - p.baseRatePct) * t
    out.push({ x: day, y: round(Math.max(0, normal(rand, level, p.noisePct)), 2) })
  }
  return out
}

/** The first day the rate stays at or above `threshold` for `run` days in a row, or undefined. */
export function firstDayAbove(points: EvalPoint[], threshold: number, run = 2): number | undefined {
  for (let i = 0; i + run <= points.length; i++)
    if (points.slice(i, i + run).every((q) => q.y >= threshold)) return points[i]!.x
  return undefined
}

// ---- moderation queue ------------------------------------------------------------------------

export interface QueueParams {
  seed: number
  hours: number
  /** Items received per hour in normal conditions. */
  basePerHour: number
  /** Items a team reviews per hour. */
  reviewPerHour: number
  /** Hour the surge starts and its length, in hours, and the multiple of normal volume. */
  surgeStart: number
  surgeHours: number
  surgeMultiple: number
}

export interface QueueHour {
  hour: number
  received: number
  reviewed: number
  backlog: number
}

export function queueVolumes(p: QueueParams): QueueHour[] {
  const rand = seeded(p.seed)
  const out: QueueHour[] = []
  let backlog = 0
  for (let hour = 0; hour < p.hours; hour++) {
    const surging = hour >= p.surgeStart && hour < p.surgeStart + p.surgeHours
    const mean = p.basePerHour * (surging ? p.surgeMultiple : 1)
    const received = Math.max(0, Math.round(normal(rand, mean, mean * 0.1)))
    const reviewed = Math.min(backlog + received, p.reviewPerHour)
    backlog = backlog + received - reviewed
    out.push({ hour, received, reviewed, backlog })
  }
  return out
}

// ---- detector scores -------------------------------------------------------------------------

export interface DetectorParams {
  seed: number
  authentic: number
  synthetic: number
  /** Mean score of authentic and synthetic items, 0 to 1; closer means more errors. */
  authenticMean: number
  syntheticMean: number
  spread: number
}

export interface DetectorScores {
  authentic: number[]
  synthetic: number[]
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/** Scores for authentic and synthetic items; the classes overlap, so a threshold makes errors. */
export function detectorScores(p: DetectorParams): DetectorScores {
  const rand = seeded(p.seed)
  const draw = (count: number, mean: number): number[] =>
    Array.from({ length: count }, () => round(clamp01(normal(rand, mean, p.spread)), 3))
  return {
    authentic: draw(p.authentic, p.authenticMean),
    synthetic: draw(p.synthetic, p.syntheticMean),
  }
}

export interface DetectorBin {
  from: number
  to: number
  authentic: number
  synthetic: number
}

/** Counts per equal-width score bin; the top bin includes 1. */
export function binScores(scores: DetectorScores, bins = 10): DetectorBin[] {
  const out: DetectorBin[] = Array.from({ length: bins }, (_, i) => ({
    from: round(i / bins, 3),
    to: round((i + 1) / bins, 3),
    authentic: 0,
    synthetic: 0,
  }))
  const at = (s: number): number => Math.min(bins - 1, Math.floor(s * bins))
  for (const s of scores.authentic) out[at(s)]!.authentic++
  for (const s of scores.synthetic) out[at(s)]!.synthetic++
  return out
}

/** Items flagged as synthetic at `threshold` that are authentic, and synthetic items missed. */
export function detectorErrors(
  scores: DetectorScores,
  threshold: number,
): { falsePositives: number; falseNegatives: number } {
  return {
    falsePositives: scores.authentic.filter((s) => s >= threshold).length,
    falseNegatives: scores.synthetic.filter((s) => s < threshold).length,
  }
}

// ---- payment timeline ------------------------------------------------------------------------

export type PaymentStep =
  | 'instruction'
  | 'approval'
  | 'release'
  | 'settled'
  | 'discovery'
  | 'hold_requested'
  | 'recall_sent'
  | 'recovered'

export interface PaymentEvent {
  /** Minutes after the first instruction. */
  minute: number
  step: PaymentStep
  /** Amount in whole currency units; zero for steps with no money. */
  amount: number
  detail: string
}

export interface PaymentParams {
  seed: number
  /** Number of transfers the fraudster asks for. */
  transfers: number
  /** Amount of each transfer, in whole currency units. */
  amountEach: number
  /** Minutes from the first instruction to the discovery. */
  discoveryMinute: number
  /** Minutes from discovery to the hold request the team makes, when it does. */
  holdDelayMinutes: number
  /** Minutes from instruction to settlement at the beneficiary bank. */
  settleAfterMinutes: number
}

/** The attempted transfers, when each was approved and released, and what followed discovery. */
export function paymentTimeline(p: PaymentParams): PaymentEvent[] {
  const rand = seeded(p.seed)
  const events: PaymentEvent[] = []
  let minute = 0
  for (let i = 1; i <= p.transfers; i++) {
    events.push({
      minute,
      step: 'instruction',
      amount: p.amountEach,
      detail: `Transfer ${i} requested`,
    })
    events.push({
      minute: minute + between(rand, 6, 14),
      step: 'approval',
      amount: p.amountEach,
      detail: `Transfer ${i} approved`,
    })
    const release = minute + between(rand, 18, 26)
    events.push({
      minute: release,
      step: 'release',
      amount: p.amountEach,
      detail: `Transfer ${i} released`,
    })
    events.push({
      minute: release + p.settleAfterMinutes,
      step: 'settled',
      amount: p.amountEach,
      detail: `Transfer ${i} settled at the beneficiary bank`,
    })
    minute += between(rand, 35, 55)
  }
  events.push({
    minute: p.discoveryMinute,
    step: 'discovery',
    amount: 0,
    detail: 'The impersonated executive says they never asked',
  })
  const hold = p.discoveryMinute + p.holdDelayMinutes
  events.push({
    minute: hold,
    step: 'hold_requested',
    amount: 0,
    detail: 'Hold requested at the bank',
  })
  events.push({ minute: hold + 12, step: 'recall_sent', amount: 0, detail: 'Recall request sent' })
  return events.sort((a, b) => a.minute - b.minute || a.step.localeCompare(b.step))
}

/** Value that had not settled when the hold was requested, which the hold could still stop. */
export function stoppableValue(events: PaymentEvent[]): { count: number; value: number } {
  const hold = events.find((e) => e.step === 'hold_requested')
  if (!hold) return { count: 0, value: 0 }
  const open = events.filter((e) => e.step === 'release' && !settledBefore(events, e, hold.minute))
  return { count: open.length, value: open.reduce((s, e) => s + e.amount, 0) }
}

function settledBefore(events: PaymentEvent[], release: PaymentEvent, minute: number): boolean {
  const n = release.detail.replace(' released', '')
  return events.some((e) => e.step === 'settled' && e.detail.startsWith(n) && e.minute <= minute)
}
