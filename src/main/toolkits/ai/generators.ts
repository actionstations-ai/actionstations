// The AI incident simulations as case-data generators (spec 0467, ADR-0142). Each is a pure
// function of its parameters; the framework labels the output simulated. They write the
// ground-truth events the AI incident metrics score decisions against, and the series and
// figure data the exercise shows. Every label says simulated and every name is fictional.
import { z } from 'zod'
import type { GeneratedDataset, SimulatedGenerator } from '../../case-data/generators'
import { evaluationSeries, paymentTimeline, type PaymentEvent } from './simulate'

const MIN = 60_000
const DAY = 86_400_000
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z')
const START = z.iso.datetime().default('2026-11-03T14:00:00Z')

/** A dataset a metric reads: a GeoJSON collection with no features and the rows under `events`. */
const eventFile = (events: unknown[]) => ({ type: 'FeatureCollection', features: [], events })

export const SyntheticFraudParams = z.object({
  start: START,
  seed: z.number().int().min(0).max(1_000_000).default(4),
  transfers: z.number().int().min(1).max(8).default(3),
  amountEach: z.number().int().min(1).max(1_000_000_000).default(480_000),
  currency: z.string().min(1).max(10).default('USD'),
  /** Minutes from the first request to the moment the fraud is discovered. */
  discoveryMinute: z.number().int().min(1).max(10_000).default(190),
  settleAfterMinutes: z.number().int().min(1).max(10_000).default(120),
})

/** Ground truth for a deepfake payment fraud: the first exposure, each transfer, the discovery. */
export function fraudEvents(p: z.infer<typeof SyntheticFraudParams>): unknown[] {
  const t0 = Date.parse(p.start)
  const timeline = paymentTimeline({
    seed: p.seed,
    transfers: p.transfers,
    amountEach: p.amountEach,
    discoveryMinute: p.discoveryMinute,
    holdDelayMinutes: 0,
    settleAfterMinutes: p.settleAfterMinutes,
  })
  const at = (e: PaymentEvent): string => iso(t0 + e.minute * MIN)
  const releases = timeline.filter((e) => e.step === 'release')
  const instructions = timeline.filter((e) => e.step === 'instruction')
  const events: unknown[] = [
    {
      id: 'first-exposure',
      time: iso(t0),
      kind: 'ai_synthetic_first_exposure',
      area: 'Treasury',
      attrs: { channel: 'video call', label: 'Video call with a synthetic executive (simulated)' },
    },
  ]
  instructions.forEach((ins, i) => {
    const rel = releases[i]!
    events.push({
      id: `payment-${i + 1}`,
      time: at(ins),
      kind: 'ai_payment_attempt',
      area: 'Treasury',
      attrs: {
        amount: ins.amount,
        currency: p.currency,
        settleAt: iso(t0 + (rel.minute + p.settleAfterMinutes) * MIN),
        transferId: `T${i + 1}`,
      },
    })
  })
  events.push({
    id: 'discovery',
    time: iso(t0 + p.discoveryMinute * MIN),
    kind: 'ai_discovery',
    area: 'Treasury',
    attrs: { how: 'the impersonated executive says they never asked' },
  })
  return events
}

export const syntheticFraudGenerator: SimulatedGenerator<z.infer<typeof SyntheticFraudParams>> = {
  id: 'ai-synthetic-fraud',
  label: 'Simulated deepfake payment fraud (transfers, approvals, settlement)',
  params: SyntheticFraudParams,
  description:
    'A payment fraud that starts with a video call from a synthetic executive: a run of transfer requests, when each one settles, and the moment the fraud is discovered. It writes the ground-truth events the AI incident measures score holds and recalls against.',
  toolkits: ['ai_incidents', 'governance'],
  example: {
    start: '2026-11-03T14:00:00Z',
    seed: 4,
    transfers: 3,
    amountEach: 480_000,
    currency: 'USD',
    discoveryMinute: 190,
    settleAfterMinutes: 120,
  } satisfies z.input<typeof SyntheticFraudParams>,
  fields: {
    start: {
      label: 'First exposure (UTC)',
      help: 'When the synthetic video call happens, as an ISO date and time.',
    },
    seed: {
      label: 'Random seed',
      help: 'Any whole number from 0 to 1,000,000; the same seed gives the same timeline.',
    },
    transfers: { label: 'Transfers', help: 'Number of transfer requests, 1 to 8.' },
    amountEach: { label: 'Amount per transfer', help: 'In whole units of the currency below.' },
    currency: { label: 'Currency', help: 'A currency code such as USD or EUR.' },
    discoveryMinute: {
      label: 'Discovered after (minutes)',
      help: 'Minutes from the first request to the moment the fraud is discovered.',
    },
    settleAfterMinutes: {
      label: 'Settles after (minutes)',
      help: 'Minutes from a payment release until it settles and can no longer be held.',
    },
  },
  generate(p): GeneratedDataset[] {
    const events = fraudEvents(p)
    return [
      {
        id: 'ai-fraud-events',
        kind: 'features',
        label: 'Synthetic impersonation fraud: exposure, transfers and discovery, simulated',
        data: eventFile(events),
      },
    ]
  },
}

export const ModelIncidentParams = z.object({
  start: START,
  seed: z.number().int().min(0).max(1_000_000).default(5),
  days: z.number().int().min(10).max(120).default(30),
  baseRatePct: z.number().min(0).max(100).default(0.6),
  shiftedRatePct: z.number().min(0).max(100).default(4.2),
  changeDay: z.number().int().min(1).max(119).default(14),
  rampDays: z.number().int().min(1).max(30).default(5),
  noisePct: z.number().min(0).max(20).default(0.25),
  /** Day (zero-based) the organization becomes aware. */
  awarenessDay: z.number().int().min(1).max(119).default(20),
  /** The role the scenario assumes; only a provider has a regulator clock. */
  role: z.enum(['provider', 'deployer', 'victim']).default('provider'),
  regulatorDueDays: z.number().int().min(1).max(60).default(15),
  customerDueDays: z.number().int().min(1).max(60).default(3),
})

/** Ground truth for an AI system incident: the harm onset, the awareness and each due clock. */
export function modelIncidentEvents(p: z.infer<typeof ModelIncidentParams>): unknown[] {
  const t0 = Date.parse(p.start)
  const day = (d: number): number => t0 + d * DAY
  const events: unknown[] = [
    {
      id: 'harm-onset',
      time: iso(day(p.changeDay)),
      kind: 'ai_harm_onset',
      area: 'AI system',
      attrs: {},
    },
    {
      id: 'awareness',
      time: iso(day(p.awarenessDay)),
      kind: 'ai_awareness',
      area: 'AI system',
      attrs: {},
    },
    {
      id: 'customer-notice-due',
      time: iso(day(p.awarenessDay) + p.customerDueDays * DAY),
      kind: 'ai_disclosure_due',
      attrs: { recipient: 'customers', trigger: 'awareness', clock: 'organization target' },
    },
  ]
  if (p.role === 'provider')
    events.push({
      id: 'regulator-report-due',
      time: iso(day(p.awarenessDay) + p.regulatorDueDays * DAY),
      kind: 'ai_disclosure_due',
      attrs: { recipient: 'regulator', trigger: 'awareness', clock: 'serious_incident_report' },
    })
  return events
}

export const modelIncidentGenerator: SimulatedGenerator<z.infer<typeof ModelIncidentParams>> = {
  id: 'ai-model-incident',
  label: 'Simulated AI system incident (harmful-output drift, awareness, disclosure clocks)',
  params: ModelIncidentParams,
  description:
    'A deployed AI system whose daily harmful-output rate drifts upward after a change, then the day the organization becomes aware and the customer and regulator notice deadlines that follow. It writes the daily rate series and the incident events the disclosure measures read.',
  toolkits: ['ai_incidents', 'governance'],
  example: {
    start: '2026-11-03T14:00:00Z',
    seed: 5,
    days: 30,
    baseRatePct: 0.6,
    shiftedRatePct: 4.2,
    changeDay: 14,
    rampDays: 5,
    noisePct: 0.25,
    awarenessDay: 20,
    role: 'provider',
    regulatorDueDays: 15,
    customerDueDays: 3,
  } satisfies z.input<typeof ModelIncidentParams>,
  fields: {
    start: { label: 'Series start (UTC)', help: 'Day 0 of the series, as an ISO date and time.' },
    seed: {
      label: 'Random seed',
      help: 'Any whole number from 0 to 1,000,000; the same seed gives the same series.',
    },
    days: { label: 'Days', help: 'Length of the daily series, 10 to 120.' },
    baseRatePct: {
      label: 'Normal harmful-output rate (%)',
      help: 'Percent of sampled outputs that are harmful before the change.',
    },
    shiftedRatePct: {
      label: 'Rate after the change (%)',
      help: 'Percent of sampled outputs that are harmful once the drift has fully set in.',
    },
    changeDay: { label: 'Change starts (day)', help: 'Zero-based day the rate starts to climb.' },
    rampDays: {
      label: 'Ramp (days)',
      help: 'Days the rate takes to climb from the normal level to the new one, 1 to 30.',
    },
    noisePct: {
      label: 'Day-to-day noise (%)',
      help: 'Standard deviation of the daily rate, in percentage points, 0 to 20.',
    },
    awarenessDay: {
      label: 'Organization aware (day)',
      help: 'Zero-based day the organization becomes aware; the notice clocks start here.',
    },
    role: {
      label: 'Organization role',
      help: 'provider, deployer or victim. Only a provider has the regulator report clock.',
    },
    regulatorDueDays: {
      label: 'Regulator report due (days)',
      help: 'Days after awareness the regulator report is due (provider only).',
    },
    customerDueDays: {
      label: 'Customer notice due (days)',
      help: 'Days after awareness the organization aims to notify customers.',
    },
  },
  generate(p): GeneratedDataset[] {
    const t0 = Date.parse(p.start)
    const series = evaluationSeries(p)
    return [
      {
        id: 'ai-harmful-output-rate',
        kind: 'series',
        label: 'Harmful-output rate on the daily sample, simulated',
        unit: '%',
        range: { start: iso(t0), end: iso(t0 + (p.days - 1) * DAY) },
        data: series.map((pt) => ({ t: iso(t0 + pt.x * DAY), v: pt.y })),
      },
      {
        id: 'ai-incident-events',
        kind: 'features',
        label: 'AI system incident: harm onset, awareness and disclosure clocks, simulated',
        data: eventFile(modelIncidentEvents(p)),
      },
    ]
  },
}
