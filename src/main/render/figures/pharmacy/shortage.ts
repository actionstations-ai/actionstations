// pharmacy_days_on_hand and pharmacy_inventory (spec 0463 FR-5). The projection draws the stock
// of one drug day by day under each allocation scenario and says on which day each runs out
// (days on hand is on hand divided by usage; an allocation lowers what is served). The inventory
// chart shows on-hand quantity by presentation against its par level. Built on the generic
// time series and bar drawing, so the same rules for patterns, markers and tables apply.
import { z } from 'zod'
import { projectStock } from '../../../../shared/pharmacy/arithmetic'
import { barKind } from '../bar'
import { fmt } from '../svg'
import { timeSeriesKind } from '../time-series'
import type { FigureKind, FigureResult } from '../types'

export const DaysOnHandData = z.object({
  title: z.string().max(200).optional(),
  drug: z.string().min(1).max(100),
  unit: z.string().max(30).default('containers'),
  onHand: z.number().min(0),
  usagePerDay: z.number().positive(),
  deliveriesPerDay: z.number().min(0).default(0),
  horizonDays: z.number().int().min(2).max(60).default(14),
  scenarios: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        /** Percent of usage the pharmacy serves; 100 is no allocation. */
        allocationPercent: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(5),
})
export type DaysOnHandData = z.infer<typeof DaysOnHandData>

function renderDaysOnHand(d: DaysOnHandData, o: { width: number; height: number }): FigureResult {
  const runs = d.scenarios.map((s) => ({
    s,
    p: projectStock({
      onHand: d.onHand,
      usagePerDay: d.usagePerDay,
      allocationPercent: s.allocationPercent,
      deliveriesPerDay: d.deliveriesPerDay,
      horizonDays: d.horizonDays,
    }),
  }))
  const title = d.title ?? `${d.drug}: projected stock`
  const base = timeSeriesKind.render(
    {
      title,
      xLabel: 'Days from now',
      yLabel: `Stock (${d.unit})`,
      unit: '',
      series: runs.map((r) => ({
        name: `${r.s.label} (${fmt(r.s.allocationPercent)}%)`,
        points: r.p.stock.map((y, x) => ({ x, y })),
      })),
      thresholds: [{ value: 0, label: 'Stockout' }],
      annotations: [],
    } as never,
    o,
  )
  const lines = runs.map(
    (r) =>
      `${r.s.label} (${fmt(r.s.allocationPercent)}% of usage): ${
        r.p.stockoutDay === undefined
          ? `stock lasts beyond ${d.horizonDays} days`
          : `projected stockout on day ${fmt(Math.round(r.p.stockoutDay * 10) / 10)}`
      }`,
  )
  const summary =
    `${title}: ${fmt(d.onHand)} ${d.unit} on hand at ${fmt(d.usagePerDay)} per day is ${fmt(Math.round((d.onHand / d.usagePerDay) * 10) / 10)} days on hand` +
    `${d.deliveriesPerDay ? `, with ${fmt(d.deliveriesPerDay)} received per day` : ''}. ${lines.join('. ')}. A projection, not a forecast; simulated.`
  return {
    svg: base.svg,
    summary,
    table: {
      caption: `${d.drug}: stock at the start of each day (${d.unit})`,
      columns: ['Day', ...runs.map((r) => `${r.s.label} (${fmt(r.s.allocationPercent)}%)`)],
      rows: Array.from({ length: d.horizonDays + 1 }, (_, day) => [
        String(day),
        ...runs.map((r) => fmt(Math.round(r.p.stock[day]!))),
      ]),
    },
  }
}

export const daysOnHandKind: FigureKind<DaysOnHandData> = {
  kind: 'pharmacy_days_on_hand',
  schema: DaysOnHandData,
  render: renderDaysOnHand,
  defaultHeight: 360,
}

export const InventoryData = z.object({
  title: z.string().max(200).optional(),
  unit: z.string().max(30).default('containers'),
  items: z
    .array(
      z.object({
        presentation: z.string().min(1).max(60),
        onHand: z.number().min(0),
        par: z.number().min(0),
      }),
    )
    .min(1)
    .max(16),
})
export type InventoryData = z.infer<typeof InventoryData>

function renderInventory(d: InventoryData, o: { width: number; height: number }): FigureResult {
  const title = d.title ?? 'Inventory by presentation'
  const base = barKind.render(
    {
      title,
      yLabel: `On hand (${d.unit})`,
      unit: '',
      bars: d.items.map((i) => ({ label: i.presentation, value: i.onHand })),
    } as never,
    o,
  )
  const pct = (i: InventoryData['items'][number]) =>
    i.par > 0 ? Math.round((i.onHand / i.par) * 100) : 0
  const low = d.items.filter((i) => i.par > 0 && i.onHand < i.par)
  const summary =
    `${title}: on-hand quantity of ${d.items.length} presentations against their par levels. ` +
    (low.length
      ? `${low.length} below par: ${low.map((i) => `${i.presentation} at ${pct(i)}% of par`).join('; ')}.`
      : 'All at or above par.')
  return {
    svg: base.svg,
    summary,
    table: {
      caption: 'On hand against par',
      columns: ['Presentation', `On hand (${d.unit})`, 'Par', 'Percent of par', 'Status'],
      rows: d.items.map((i) => [
        i.presentation,
        fmt(i.onHand),
        fmt(i.par),
        `${pct(i)}%`,
        i.par > 0 && i.onHand < i.par ? 'Below par' : 'At or above par',
      ]),
    },
  }
}

export const inventoryKind: FigureKind<InventoryData> = {
  kind: 'pharmacy_inventory',
  schema: InventoryData,
  render: renderInventory,
  defaultHeight: 340,
}
