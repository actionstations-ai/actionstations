// Accommodations (#739, spec 0453 FR-11). Adjustments, not diagnoses, applied to one student as
// written and never generalized to the class. Pure helpers for the live session and the set-up list.
import type { Accommodation } from '../schemas/classroom'

/** A student's allowance for a timed response: the base time times their multiplier. */
export function adjustedSeconds(
  baseSeconds: number,
  acc: Pick<Accommodation, 'timeMultiplier'> | undefined,
): number {
  return Math.round(baseSeconds * (acc?.timeMultiplier ?? 1))
}

/** True when the record changes anything. */
export function hasAdjustment(a: Accommodation): boolean {
  return (
    a.timeMultiplier > 1 ||
    a.responseMethod !== 'default' ||
    a.packet !== 'standard' ||
    a.breaks ||
    a.quieterRole ||
    a.note.trim() !== ''
  )
}

/** Plain lines for the instructor's set-up list. The free-text note is shown only to the instructor. */
export function describeAccommodation(a: Accommodation): string[] {
  const lines: string[] = []
  if (a.timeMultiplier > 1)
    lines.push(
      `Extended time: ${a.timeMultiplier} times the allowance on this student's timed responses and prompts (the shared clock is unchanged)`,
    )
  if (a.responseMethod === 'written') lines.push('Responds in writing instead of speaking')
  if (a.responseMethod === 'spoken') lines.push('Responds by speaking instead of writing')
  if (a.packet === 'screen_reader') lines.push('Screen-reader packet')
  if (a.packet === 'large_print') lines.push('Large-print packet')
  if (a.breaks) lines.push('Breaks as needed')
  if (a.quieterRole) lines.push('Observer or evaluator role with an equivalent rubric')
  if (a.note.trim()) lines.push(`Note: ${a.note.trim()}`)
  return lines
}
