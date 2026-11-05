// Staffing arithmetic (spec 0452 FR-4, FR-8): on duty = scheduled - called out + called in +
// agency, and the shortfall against need. Pure.

export interface ShiftInput {
  shift: string
  needed: number
  scheduled: number
  calledOut?: number
  calledIn?: number
  agency?: number
}

export interface ShiftRow extends Required<ShiftInput> {
  onDuty: number
  shortBy: number
}

export function shiftRow(s: ShiftInput): ShiftRow {
  const calledOut = s.calledOut ?? 0
  const calledIn = s.calledIn ?? 0
  const agency = s.agency ?? 0
  const onDuty = Math.max(0, s.scheduled - calledOut + calledIn + agency)
  return { ...s, calledOut, calledIn, agency, onDuty, shortBy: Math.max(0, s.needed - onDuty) }
}

/** Patients per nurse, one decimal; undefined with no nurses on duty. */
export function patientsPerNurse(census: number, onDuty: number): number | undefined {
  return onDuty > 0 ? Math.round((census / onDuty) * 10) / 10 : undefined
}
