// Derived values for the staffing grid (spec 0452): the on-duty count and the shortfall are
// arithmetic, so the app computes them instead of trusting the written numbers.
import { shiftRow, type ShiftInput } from '../../../shared/clinical/staffing'

export function deriveStaffing(fields: Record<string, unknown>): Record<string, unknown> {
  const shifts = Array.isArray(fields.shifts) ? (fields.shifts as ShiftInput[]) : []
  return { shifts: shifts.map(shiftRow) }
}
