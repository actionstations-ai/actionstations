// Control suggestions for freshly generated MSEL rows (spec 0426 FR-11): the mapping rules of
// the project's enabled frameworks run over the rows a phase just wrote, and what they suggest is
// stored on each row as `controlSuggestions` for the designer to accept or remove in the MSEL
// editor. Suggestions the model made earlier are kept. Rules are plain data matching: no model
// call, and a failure here never stops generation.
import { suggestControls } from '@shared/compliance/rules'
import type { Framework } from '@shared/schemas/compliance'
import type { MselRow, Project, Scenario } from '@shared/schemas'
import { isEnabled, layeredItems } from '../compliance/registry'

/** The suggestions the rules make for `row`, minus controls it already has. */
export function ruleSuggestions(
  frameworks: readonly Framework[],
  row: MselRow,
  s: Pick<Scenario, 'brief'>,
): string[] {
  const have = new Set(row.controls ?? [])
  return frameworks
    .flatMap((f) => suggestControls(f, row, { threatFamily: s.brief.threatFamily }))
    .filter((ref) => !have.has(ref))
}

/** Store rule suggestions on `rows` (rows of `s`); returns how many rows got at least one. */
export function applyRuleSuggestions(
  frameworks: readonly Framework[],
  s: Scenario,
  rows: readonly MselRow[],
): number {
  let touched = 0
  for (const row of rows) {
    const fresh = ruleSuggestions(frameworks, row, s)
    const kept = (row.controlSuggestions ?? []).filter((x) => x.by === 'model')
    const next = [...fresh.map((ref) => ({ ref, by: 'rule' as const })), ...kept]
    if (next.length) {
      row.controlSuggestions = next.slice(0, 100)
      touched++
    } else delete row.controlSuggestions
  }
  return touched
}

/** The frameworks the project has switched on; empty when none or when they cannot be read. */
export async function enabledFrameworks(root: string, project: Project): Promise<Framework[]> {
  try {
    return (await layeredItems(root, 'frameworks'))
      .map((l) => l.item)
      .filter((f) => isEnabled(project, 'frameworks', f.id))
  } catch {
    return []
  }
}
