// Power shutoff format checks (spec 0461 FR-6). The 48-72 hour partner window is an example
// rule from one state (see windows.ts), so these messages tell the author to say that a window
// was missed rather than forbidding it.

export interface ShutoffLintIssue {
  rule: 'psps_windows' | 'psps_counts'
  message: string
}

/** A partner notice belongs 48 to 72 hours before the window opens (the example rule). */
export function lintPartnerNoticeTiming(hoursAhead: number): ShutoffLintIssue[] {
  return hoursAhead >= 48 && hoursAhead <= 72
    ? []
    : [
        {
          rule: 'psps_windows',
          message: `A partner notice ${hoursAhead} hours ahead is outside the 48-72 hour window; say that it missed the window or change the time.`,
        },
      ]
}

/** Medical baseline counts: reached never exceeds attempted, which never exceeds customers. */
export function lintMedicalBaselineCounts(c: {
  customers: number
  attempted: number
  reached: number
}): ShutoffLintIssue[] {
  const issues: ShutoffLintIssue[] = []
  if (c.attempted > c.customers)
    issues.push({
      rule: 'psps_counts',
      message: `${c.attempted} contact attempts cannot exceed the ${c.customers} medical baseline customers.`,
    })
  if (c.reached > c.attempted)
    issues.push({
      rule: 'psps_counts',
      message: `${c.reached} customers reached cannot exceed the ${c.attempted} attempts.`,
    })
  return issues
}
