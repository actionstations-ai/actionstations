// Supply pipeline arithmetic (spec 0469 FR-5, FR-10): stock projected from consumption and
// shipments, the day stock reaches zero, and the latest day a reorder could still arrive in time.
// Pure and shared by the pipeline figure, the simulator, the lint rules and the metrics, so they
// cannot disagree. Days are counted from the day the stock figure was taken (day 0).

export interface PipelineShipment {
  /** Day the shipment arrives and is available (day 0 is the stock count). */
  day: number
  quantity: number
  label?: string
}

export interface PipelineInput {
  stockOnHand: number
  dailyConsumption: number
  shipments: readonly PipelineShipment[]
}

/** Days of stock: stock on hand divided by daily consumption. */
export function daysOfStock(stockOnHand: number, dailyConsumption: number): number | undefined {
  return dailyConsumption > 0 ? stockOnHand / dailyConsumption : undefined
}

/**
 * The day stock reaches zero given the shipments that arrive before it does, or undefined when
 * it never does within `horizonDays`. Arrivals on a day are added before that day's use.
 */
export function breakDay(p: PipelineInput, horizonDays: number): number | undefined {
  if (p.dailyConsumption <= 0) return undefined
  const arrivals = [...p.shipments].filter((s) => s.day >= 0).sort((a, b) => a.day - b.day)
  let t = 0
  let stock = p.stockOnHand
  for (const s of arrivals) {
    const reach = t + stock / p.dailyConsumption
    if (reach < s.day) return reach <= horizonDays ? reach : undefined
    stock -= (s.day - t) * p.dailyConsumption
    stock += s.quantity
    t = s.day
  }
  const reach = t + stock / p.dailyConsumption
  return reach <= horizonDays ? reach : undefined
}

export interface StockPoint {
  day: number
  stock: number
}

/** The stock curve at day 0, every arrival (before and after it lands), the break and the horizon. */
export function stockCurve(p: PipelineInput, horizonDays: number): StockPoint[] {
  const out: StockPoint[] = [{ day: 0, stock: p.stockOnHand }]
  const stop = breakDay(p, horizonDays)
  const end = stop ?? horizonDays
  let t = 0
  let stock = p.stockOnHand
  const arrivals = [...p.shipments]
    .filter((s) => s.day > 0 && s.day <= end)
    .sort((a, b) => a.day - b.day)
  for (const s of arrivals) {
    stock -= (s.day - t) * p.dailyConsumption
    out.push({ day: s.day, stock: Math.max(0, stock) })
    stock += s.quantity
    out.push({ day: s.day, stock })
    t = s.day
  }
  stock -= (end - t) * p.dailyConsumption
  out.push({ day: end, stock: Math.max(0, stock) })
  return out
}

/** The latest day an order could be placed and still arrive before the break. */
export const latestOrderDay = (breakAt: number, leadTimeDays: number): number =>
  breakAt - leadTimeDays
