// Toolkit lint rules at scenario lint (spec 0448 FR-1 `lintRules`). A toolkit names the rule ids
// it relies on; the rules themselves are app code registered in `lint-rules.ts` (each reads the
// fields of the inject types it names). When a scenario has a toolkit that lists lint rules, every
// inject of the scenario is checked and each finding becomes a warning on that inject. A scenario
// without such a toolkit gets nothing from here.
import type { LintWarning, Scenario } from '@shared/schemas'
import { listInjects } from '../scenario/store'
import { fieldLintIssues, fieldLintRuleIds } from './lint-rules'
import { resolveToolkits } from './registry'

export const TOOLKIT_LINT = 'TOOLKIT_LINT'

/** Rule ids the scenario's toolkits name that the app has no rule for. */
export function unknownRuleIds(lintRules: readonly string[]): string[] {
  const known = new Set(fieldLintRuleIds())
  return lintRules.filter((id) => !known.has(id))
}

/** Warnings from the lint rules of the scenario's toolkits over the scenario's injects. */
export async function toolkitLintWarnings(
  root: string,
  scenario: Pick<Scenario, 'id' | 'toolkits'>,
): Promise<LintWarning[]> {
  if (!scenario.toolkits.length) return []
  const toolkits = await resolveToolkits(scenario.toolkits)
  if (!toolkits.some((t) => t.lintRules.length)) return []
  const injects = await listInjects(root, scenario.id)
  return injects.flatMap((inject) =>
    fieldLintIssues(inject.type, inject.fields).map((issue): LintWarning => ({
      code: TOOLKIT_LINT,
      severity: 'warning',
      message: `${inject.title || inject.id}: ${issue.message} (${issue.path})`,
      rowId: inject.mselRowId,
      injectId: inject.id,
      source: 'lint',
    })),
  )
}
