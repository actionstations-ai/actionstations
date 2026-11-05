// Power shutoff notification windows (spec 0461 FR-6, FR-13). The windows are California's
// example rule from the CPUC decision D.19-05-042 (page 86 and Appendix A page A8 of the
// decision, read 2026-11-05; the later decision D.21-06-034 updated the guidelines and was not
// read). They are not a national requirement, so a project may replace them.
// Pure functions shared by the format checks and the timing metric.

export interface NotificationWindow {
  /** The label notices carry ("48-72 hours before"). */
  label: string
  audience: 'partners' | 'customers' | 'all'
  /** Window opens this many hours before de-energization (the earliest allowed). */
  maxHoursBefore: number
  /** Window closes this many hours before de-energization (the latest allowed). */
  minHoursBefore: number
}

export const DEFAULT_WINDOWS: readonly NotificationWindow[] = [
  { label: '48-72 hours before', audience: 'partners', maxHoursBefore: 72, minHoursBefore: 48 },
  { label: '24-48 hours before', audience: 'customers', maxHoursBefore: 48, minHoursBefore: 24 },
  { label: '1-4 hours before', audience: 'all', maxHoursBefore: 4, minHoursBefore: 1 },
]

/** Minutes after de-energization within which the power-off notice still counts as "at". */
export const AT_DEENERGIZATION_TOLERANCE_MIN = 30

export interface WindowCheck {
  met: boolean
  /** Hours between the notice and de-energization; negative when sent after. */
  hoursBefore: number
  reason: string
}

/** Check one notice time against a window and the de-energization time (both epoch ms). */
export function checkWindow(
  window: Pick<NotificationWindow, 'label' | 'maxHoursBefore' | 'minHoursBefore'>,
  sentAt: number,
  deenergizeAt: number,
): WindowCheck {
  const hoursBefore = (deenergizeAt - sentAt) / 3_600_000
  const met = hoursBefore >= window.minHoursBefore && hoursBefore <= window.maxHoursBefore
  const reason = met
    ? `Sent ${hoursBefore.toFixed(1)} hours before, inside the ${window.label} window.`
    : `Sent ${hoursBefore.toFixed(1)} hours before, outside the ${window.label} window.`
  return { met, hoursBefore, reason }
}

/** The power-off notice: sent no earlier than an hour before and within the tolerance after. */
export function checkAtDeenergization(
  sentAt: number,
  deenergizeAt: number,
  toleranceMin = AT_DEENERGIZATION_TOLERANCE_MIN,
): WindowCheck {
  const minutesAfter = (sentAt - deenergizeAt) / 60_000
  const met = minutesAfter <= toleranceMin && minutesAfter >= -60
  return {
    met,
    hoursBefore: -minutesAfter / 60,
    reason: met
      ? `Sent ${minutesAfter.toFixed(0)} minutes after de-energization, within ${toleranceMin} minutes.`
      : `Sent ${minutesAfter.toFixed(0)} minutes after de-energization, outside the ${toleranceMin}-minute tolerance.`,
  }
}
