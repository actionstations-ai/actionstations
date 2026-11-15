// Words of the simulated downtime section in the Live tab (issue #1130).
export const CD = {
  heading: 'Simulated downtime',
  intro:
    'What the decisions recorded so far do to the simulated hospital. The rules are a teaching table, not a model of real systems.',
  figuresCaption: 'The downtime model before and after the decisions',
  measure: 'Figure',
  before: 'Before decisions',
  now: 'Now',
  rulesHeading: 'Consequence rules that fired',
  noRules: 'No rule has fired yet.',
  applied: 'Applied',
  overridden: 'Overridden',
  overrideHint:
    'To stop a rule changing the case, record “Override a consequence rule (facilitator)”.',
  backEntryHeading: (percent: number) => `Back-entry: ${percent}% complete`,
  simulatedCount: 'simulated paper count',
  scopeFull: (hours: number, limit: number) =>
    `A ${hours}-hour downtime is back-entered in full (the default limit is ${limit} hours).`,
  scopePartial: (hours: number, limit: number) =>
    `A ${hours}-hour downtime is longer than the ${limit}-hour full back-entry limit: enter the essentials and scan the rest.`,
  alwaysEntered: 'Always entered',
  alsoEntered: 'Also entered',
  scanned: 'Scanned, not re-entered',
  checks: 'Before units leave paper',
  discrepanciesHeading: 'Discrepancies',
  dueSent: 'Due: sent to the players',
  dueReadOut: 'Due: read it out',
  notYet: (threshold: number) => `Due at ${threshold}% of back-entry`,
  closed: 'Reconciliation is closed; no more discrepancies fall due.',
} as const
