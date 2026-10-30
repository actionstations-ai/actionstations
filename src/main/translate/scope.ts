// What a translation covers (spec 0435 FR-2): the player documents, the injects handed to
// players, and, only when asked for, the controller documents. Rows only controllers or the
// SimCell see are skipped.
import type { Inject, MselRow, Scenario, TranslatableDoc } from '@shared/schemas'

const CONTROLLER_WORDS =
  /\b(controllers?|simcell|sim cell|sim-cell|evaluators?|facilitators?|c\/e)\b/i
const CONTROL_TAGS = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])

/** Recipient labels of a row: its "To" label, else its role names and abbreviations. */
function recipientLabels(row: MselRow, scenario: Pick<Scenario, 'roles'>): string[] {
  if (row.toLabel?.trim()) return [row.toLabel]
  return row.toRoleIds.map((id) => {
    const role = scenario.roles.find((r) => r.id === id)
    return role ? `${role.name} ${role.abbreviation} ${role.team}` : id
  })
}

/** True when every recipient is a controller or the SimCell, or the row only runs the clock. */
export function isControllerOnlyRow(row: MselRow, scenario: Pick<Scenario, 'roles'>): boolean {
  if (CONTROL_TAGS.has(row.purposeTag)) return true
  const labels = recipientLabels(row, scenario)
  return labels.length > 0 && labels.every((l) => CONTROLLER_WORDS.test(l))
}

/** The injects whose MSEL row goes to players, in the order given. */
export function playerInjects(scenario: Scenario, injects: Inject[]): Inject[] {
  const rows = new Map(scenario.msel.map((r) => [r.id, r]))
  return injects.filter((i) => {
    const row = rows.get(i.mselRowId)
    return !!row && !isControllerOnlyRow(row, scenario)
  })
}

/** Documents in scope for the scenario's language settings. */
export function docsInScope(scenario: Pick<Scenario, 'languages'>): TranslatableDoc[] {
  const docs: TranslatableDoc[] = ['briefing', 'handouts']
  if (scenario.languages?.controller) docs.push('handbook', 'controller_handouts')
  return docs
}

export type ItemRef =
  | { kind: 'doc'; id: TranslatableDoc }
  | { kind: 'inject'; id: string }
  | { kind: 'survey'; id: string }

export const itemKey = (ref: ItemRef): string => `${ref.kind}:${ref.id}`
