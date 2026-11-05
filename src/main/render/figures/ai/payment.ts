// ai_payment_timeline and ai_inventory_table (spec 0467 FR-5). The timeline shows each
// requested transfer, its approval, release and settlement, then the discovery and the hold and
// recall that follow, and states how much value the hold could still stop. The inventory table
// lists AI systems with owner, vendor and risk class. Both use fictional names and say so.
import { z } from 'zod'
import { annotatedTimelineKind } from '../annotated-timeline'
import { fmt } from '../svg'
import { withDescription } from './common'
import { tableKind } from '../table'
import type { FigureKind, FigureOptions, FigureResult } from '../types'

const STEPS = [
  'instruction',
  'approval',
  'release',
  'settled',
  'discovery',
  'hold_requested',
  'recall_sent',
  'recovered',
] as const

const STEP_LABEL: Record<(typeof STEPS)[number], string> = {
  instruction: 'Requested',
  approval: 'Approved',
  release: 'Released',
  settled: 'Settled',
  discovery: 'Discovered',
  hold_requested: 'Hold requested',
  recall_sent: 'Recall sent',
  recovered: 'Recovered',
}

const LANE: Record<(typeof STEPS)[number], string> = {
  instruction: 'Requests',
  approval: 'Approvals',
  release: 'Payments',
  settled: 'Payments',
  discovery: 'Response',
  hold_requested: 'Response',
  recall_sent: 'Response',
  recovered: 'Response',
}

export const AiPaymentTimelineData = z
  .object({
    title: z.string().max(200).optional(),
    currency: z.string().min(1).max(10).default('USD'),
    events: z
      .array(
        z.object({
          minute: z.number().int().min(0).max(100_000),
          step: z.enum(STEPS),
          amount: z.number().int().min(0).max(1_000_000_000),
          detail: z.string().min(1).max(120),
        }),
      )
      .min(2)
      .max(40),
    simulated: z.boolean().default(true),
  })
  .refine((d) => d.events.some((e) => e.step === 'instruction'), {
    message: 'needs at least one instruction',
  })
export type AiPaymentTimelineData = z.infer<typeof AiPaymentTimelineData>

export interface PaymentTally {
  attempted: number
  attemptedCount: number
  settledBeforeHold: number
  stoppableCount: number
  stoppableValue: number
  holdMinute?: number
  minutesToHold?: number
}

/** Value attempted, value that settled before the hold, and value the hold could still stop. */
export function paymentTally(d: AiPaymentTimelineData): PaymentTally {
  const instructions = d.events.filter((e) => e.step === 'instruction')
  const hold = d.events.find((e) => e.step === 'hold_requested')
  const first = Math.min(...instructions.map((e) => e.minute))
  const released = d.events.filter((e) => e.step === 'release')
  const settled = d.events.filter((e) => e.step === 'settled')
  const settledBy = (rel: { detail: string }): number | undefined =>
    settled.find((s) => s.detail.startsWith(rel.detail.replace(/ released$/, '')))?.minute
  const settledEarly = hold
    ? released.filter((r) => (settledBy(r) ?? Infinity) <= hold.minute)
    : released
  const open = hold ? released.filter((r) => !settledEarly.includes(r)) : []
  const sum = (xs: { amount: number }[]): number => xs.reduce((s, e) => s + e.amount, 0)
  return {
    attempted: sum(instructions),
    attemptedCount: instructions.length,
    settledBeforeHold: sum(settledEarly),
    stoppableCount: open.length,
    stoppableValue: sum(open),
    ...(hold ? { holdMinute: hold.minute, minutesToHold: hold.minute - first } : {}),
  }
}

function renderPayments(d: AiPaymentTimelineData, o: FigureOptions): FigureResult {
  const events = [...d.events].sort((a, b) => a.minute - b.minute)
  const money = (v: number): string => `${fmt(v)} ${d.currency}`
  const drawn = annotatedTimelineKind.render(
    {
      title: d.title ?? 'Payment and approval timeline',
      xLabel: 'Minutes since the first request',
      lanes: ['Requests', 'Approvals', 'Payments', 'Response'],
      events: events.map((e) => ({
        x: e.minute,
        label: STEP_LABEL[e.step],
        detail: `${e.detail}${e.amount ? `, ${money(e.amount)}` : ''}`,
        lane: LANE[e.step],
      })),
      spans: [],
    },
    o,
  )
  const t = paymentTally(d)
  const hold =
    t.minutesToHold === undefined
      ? 'No hold was requested.'
      : `A hold was requested ${t.minutesToHold} minutes after the first request; ${t.stoppableCount} transfer${t.stoppableCount === 1 ? '' : 's'} worth ${money(t.stoppableValue)} had not settled and could still be stopped, and ${money(t.settledBeforeHold)} had settled.`
  const note = d.simulated
    ? ' Simulated payments for the exercise; every bank and account is fictional.'
    : ''
  const summary = `${drawn.summary} ${t.attemptedCount} transfers worth ${money(t.attempted)} were requested. ${hold}${note}`
  return {
    svg: withDescription(drawn.svg, summary),
    summary,
    table: {
      caption: d.title ?? 'Payment and approval timeline',
      columns: ['Minute', 'Step', `Amount (${d.currency})`, 'Detail'],
      rows: events.map((e) => [
        String(e.minute),
        STEP_LABEL[e.step],
        e.amount ? fmt(e.amount) : '',
        e.detail,
      ]),
    },
  }
}

export const aiPaymentTimelineKind: FigureKind<AiPaymentTimelineData> = {
  kind: 'ai_payment_timeline',
  schema: AiPaymentTimelineData,
  render: renderPayments,
}

// ---- AI system inventory ---------------------------------------------------------------------

const RISK = ['prohibited', 'high', 'limited', 'minimal', 'unclassified'] as const

export const AiInventoryTableData = z.object({
  title: z.string().max(200).optional(),
  systems: z
    .array(
      z.object({
        name: z.string().min(1).max(60),
        purpose: z.string().min(1).max(120),
        riskClass: z.enum(RISK),
        owner: z.string().min(1).max(60),
        vendor: z.string().max(60).default('In-house'),
        status: z.enum(['live', 'pilot', 'paused', 'retired']),
      }),
    )
    .min(1)
    .max(40),
  simulated: z.boolean().default(true),
})
export type AiInventoryTableData = z.infer<typeof AiInventoryTableData>

const COLUMNS = ['System', 'Purpose', 'Risk class', 'Owner', 'Vendor', 'Status']

function renderInventory(d: AiInventoryTableData, o: FigureOptions): FigureResult {
  const rows = d.systems.map((s) => [s.name, s.purpose, s.riskClass, s.owner, s.vendor, s.status])
  const note = d.simulated ? 'Fictional inventory for the exercise.' : undefined
  const drawn = tableKind.render(
    {
      title: d.title ?? 'AI system inventory',
      ...(note ? { caption: note } : {}),
      columns: COLUMNS,
      rows,
    },
    o,
  )
  const count = (r: string): number => d.systems.filter((s) => s.riskClass === r).length
  const paused = d.systems.filter((s) => s.status === 'paused').map((s) => s.name)
  const summary =
    `${d.title ?? 'AI system inventory'}: ${d.systems.length} systems (${count('high')} high risk, ` +
    `${count('limited')} limited, ${count('minimal')} minimal, ${count('unclassified')} unclassified` +
    `${count('prohibited') ? `, ${count('prohibited')} prohibited` : ''}).` +
    `${paused.length ? ` Paused: ${paused.join(', ')}.` : ''}${note ? ` ${note}` : ''}`
  return {
    svg: withDescription(drawn.svg, summary),
    summary,
    table: { caption: d.title ?? 'AI system inventory', columns: COLUMNS, rows },
  }
}

export const aiInventoryTableKind: FigureKind<AiInventoryTableData> = {
  kind: 'ai_inventory_table',
  schema: AiInventoryTableData,
  render: renderInventory,
}
