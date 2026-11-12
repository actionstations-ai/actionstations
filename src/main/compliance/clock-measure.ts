// The facilitator's record of a regulation's clocks, for the notification clocks measure (#1137).
// Facilitate keeps which triggers fired and which clocks were filed, missed or waived; this turns
// that record into each clock's start, deadline and outcome at the end of the exercise, with the
// same clock maths the Facilitate strip and the coverage report use.
import { anchorsFrom, clockViews, deadline } from '@shared/compliance/clock'
import { formatLocal } from '@shared/compliance/scenario-time'
import { CLOCK_REF_PREFIX, sessionOf, type Regulation } from '@shared/schemas/compliance'
import type { FacilitatorState } from '@shared/ipc/facilitator'
import type { ClockRecord, RegulationClocks } from '../evaluation/metrics/notification-clocks'
import { readFacilitatorState } from '../facilitator/state'
import { getScenario } from '../scenario/store'
import type { MetricInputProvider } from '../toolkits/metrics'
import { facilitatorMinutes, startOf } from './coverage'
import { layeredItems } from './registry'

const waitingLabel = (reg: Regulation, ref: string): string =>
  ref.startsWith(CLOCK_REF_PREFIX)
    ? (reg.clocks.find((c) => c.id === ref.slice(CLOCK_REF_PREFIX.length))?.label ?? ref)
    : (reg.triggers.find((t) => t.id === ref)?.label ?? ref)

/** The clocks of `reg` as the facilitator state leaves them at its clock's current minute. */
export function regulationClocks(
  reg: Regulation,
  state: FacilitatorState,
  start: Date,
  now = new Date(),
): RegulationClocks {
  const session = sessionOf(state)
  const views = clockViews(reg, session, start, facilitatorMinutes(state, now))
  const anchors = anchorsFrom(reg.id, session, start)
  const clocks = views.map((v): ClockRecord => {
    const due = deadline(reg, v.clockId, anchors)
    const startedAt = 'startedAt' in due ? formatLocal(due.startedAt) : undefined
    const d = v.dueAt
    return {
      id: v.clockId,
      label: v.label,
      recipient: v.recipient,
      status: v.status,
      ...(startedAt ? { startedAt } : {}),
      ...(d ? { dueAt: formatLocal(d) } : {}),
      ...(v.completion?.atDate ? { closedAt: formatLocal(v.completion.atDate) } : {}),
      ...(v.completion?.note ? { note: v.completion.note } : {}),
      waitingFor: v.waitingFor.map((r) => waitingLabel(reg, r)),
    }
  })
  return { regulationId: reg.id, label: reg.label, citation: reg.citation, clocks }
}

/** Input provider for `notification_clocks_met`: the configured regulation's clocks. */
export const regulationClocksProvider: MetricInputProvider = async ({ root, scenarioId, ref }) => {
  const id = String(ref.config?.regulation ?? '')
  const reg = (await layeredItems(root, 'regulations')).map((l) => l.item).find((r) => r.id === id)
  if (!reg) return { clocks: [] }
  const [scenario, state] = await Promise.all([
    getScenario(root, scenarioId),
    readFacilitatorState(root, scenarioId),
  ])
  return { clocks: [regulationClocks(reg, state, startOf(scenario).at)] }
}
