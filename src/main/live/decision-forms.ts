/**
 * Where decision forms come from (spec 0448 FR-14). A toolkit defines forms as data; the
 * toolkit registry hands them over through `provideDecisionForms`, the one function the rest of
 * the app calls. Until a provider is set there are no forms, and nothing else changes.
 */
import { DECISION_LIMITS, DecisionForm } from '@shared/schemas/decisions'

export interface DecisionFormContext {
  root: string
  scenarioId: string
}

/** Returns the forms of the toolkits a scenario uses; unchecked data, validated here. */
export type DecisionFormProvider = (
  ctx: DecisionFormContext,
) => Promise<readonly unknown[]> | readonly unknown[]

let provider: DecisionFormProvider | undefined

/** Set (or clear, with undefined) the source of decision forms. Returns the previous one. */
export function provideDecisionForms(next: DecisionFormProvider | undefined) {
  const before = provider
  provider = next
  return before
}

/**
 * The valid forms for a scenario: each checked against the schema, the first of a repeated id
 * kept, at most `formsPerSession`. A form that fails the schema is skipped with a warning, so
 * one bad form in a pack does not take the others down.
 */
export async function decisionFormsFor(ctx: DecisionFormContext): Promise<DecisionForm[]> {
  if (!provider) return []
  const raw = await provider(ctx)
  const out = new Map<string, DecisionForm>()
  for (const candidate of raw) {
    const parsed = DecisionForm.safeParse(candidate)
    if (!parsed.success) {
      console.warn('[decisions] skipped an invalid decision form:', parsed.error.issues[0]?.message)
      continue
    }
    if (!out.has(parsed.data.id)) out.set(parsed.data.id, parsed.data)
    if (out.size >= DECISION_LIMITS.formsPerSession) break
  }
  return [...out.values()]
}
