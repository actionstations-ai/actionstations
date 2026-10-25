// A smaller critique request for a model whose context window the full one overflows (#347):
// the critique sends the whole MSEL, the lints and eight plan sections, which a 32k context
// cannot always hold next to a 6,000-token reply. The compact request keeps every row but cuts
// each event and expected action short, keeps the most important lints and three sections.

/** Plan sections the compact request retrieves (the full one retrieves eight). */
export const COMPACT_SECTIONS = 3
const EVENT_CHARS = 220
const ACTION_CHARS = 120
const MAX_LINTS = 20

const cut = (s: unknown, n: number): unknown =>
  typeof s === 'string' && s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s

interface LintVar {
  severity: string
}

/** The critique's variables with the MSEL rows shortened, citations dropped and lints capped. */
export function compactCritiqueVars(vars: Record<string, unknown>): Record<string, unknown> {
  const scenario = vars.scenario as { msel?: Record<string, unknown>[] } | undefined
  const lints = (vars.lints as LintVar[] | undefined) ?? []
  const rank = (w: LintVar): number => ['error', 'warning', 'info'].indexOf(w.severity)
  return {
    ...vars,
    scenario: scenario && {
      ...scenario,
      msel: (scenario.msel ?? []).map((r) => ({
        ...r,
        event: cut(r.event, EVENT_CHARS),
        expectedAction: cut(r.expectedAction, ACTION_CHARS),
        citations: [],
      })),
    },
    lints: [...lints].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_LINTS),
  }
}

/** The error a critique that got no JSON twice reports: what happened and what to change. */
export function critiqueContextError(detail: string): string {
  return (
    `The review step got no JSON from the model, also with a shorter request (${detail.trim()}). ` +
    'The scenario is probably too long for the context window the model was loaded with: ' +
    'load it with a larger context (64k tokens works for a 4-hour exercise; in LM Studio, set ' +
    'the context length when loading the model) or pick a model with a longer context, then ' +
    'run the review again.'
  )
}
