import type { DecisionRecord } from '@shared/ipc/facilitator'
import { ruleText } from '../../editors/msel/branch-ops'

/** "Chosen by majority: 7 of 11", "Chosen by the controller", "Chosen when time ran out". */
export function chosenLine(rec: DecisionRecord): string {
  if (rec.by === 'controller') return 'Chosen by the controller'
  if (rec.by === 'timeout') return 'Chosen when time ran out: the default'
  if (rec.by === 'override') return 'Changed by the controller'
  const top = rec.input.tally[rec.optionId] ?? 0
  const of = rec.input.cast > 0 ? `: ${top} of ${rec.input.cast}` : ''
  return `Chosen by ${ruleText(rec.rule)}${of}`
}
