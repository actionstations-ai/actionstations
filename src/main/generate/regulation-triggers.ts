// Regulation triggers in generation (spec 0426, generation hook). The prompt for an MSEL phase
// lists the triggers of the regulations the project has switched on ("the company determines the
// incident is material"), so the model can place the row where that moment happens and name it
// in `triggers`. The mapper keeps only references that exist in the enabled regulations: a
// model that invents a regulation or a trigger id loses that reference and nothing else.
import type { LintWarning, MselRow, MselRowTrigger } from '@shared/schemas/scenario'

/** Most triggers listed in a prompt: keeps the list short and the cost flat. */
export const MAX_LISTED_TRIGGERS = 24
/** Most triggers one row may name. */
export const MAX_TRIGGERS_PER_ROW = 2

export interface TriggerChoice {
  regulationId: string
  triggerId: string
  /** "SEC Form 8-K Item 1.05" */
  regulation: string
  /** "The company determines the incident is material" */
  label: string
  hint: string
}

/** The prompt variable: one line per trigger, with the ids the model must copy. */
export function triggerPromptVars(choices: readonly TriggerChoice[]) {
  return choices.map((c) => ({
    regulationId: c.regulationId,
    triggerId: c.triggerId,
    regulation: c.regulation,
    label: c.label,
    hint: c.hint,
  }))
}

/** Rows that structure the exercise; a reporting clock never starts on them. */
const STRUCTURAL_TAGS: ReadonlySet<string> = new Set(['STARTEX', 'ENDEX', 'TIME_JUMP'])
/** Words of a trigger label that every incident row contains, so they prove nothing. */
const COMMON_STEMS: ReadonlySet<string> = new Set(['incid', 'cyber', 'playe', 'compa', 'entit'])

/** First five letters of each longer word of the label: "Ransom payment made" gives ranso, payme. */
function labelStems(label: string): string[] {
  const words = label.toLowerCase().match(/[a-z]{5,}/g) ?? []
  return [...new Set(words.map((w) => w.slice(0, 5)))].filter((w) => !COMMON_STEMS.has(w))
}

export interface TriggerRowText {
  event: string
  expectedAction: string
  purposeTag: string
}

/**
 * The row must be that moment, not only mention the incident: its text has to carry a word of
 * the trigger's label ("ransom", "material"), and it cannot be a STARTEX, TIME_JUMP or ENDEX
 * row. Small local models attach triggers to any row; this keeps the ones that fit.
 */
function fits(choice: TriggerChoice, row: TriggerRowText | undefined): boolean {
  if (!row) return true
  if (STRUCTURAL_TAGS.has(row.purposeTag)) return false
  const text = `${row.event} ${row.expectedAction}`.toLowerCase()
  return labelStems(choice.label).some((stem) => new RegExp(`\\b${stem}`).test(text))
}

/**
 * The model's triggers for one row, reduced to real, distinct ones that fit the row. Without
 * `row` (a unit that has no row text) only the existence check applies.
 */
export function validTriggers(
  raw: readonly { regulationId: string; triggerId: string }[] | undefined,
  choices: readonly TriggerChoice[],
  row?: TriggerRowText,
): MselRowTrigger[] {
  if (!raw?.length || !choices.length) return []
  const byKey = new Map(choices.map((c) => [`${c.regulationId}:${c.triggerId}`, c]))
  const seen = new Set<string>()
  const out: MselRowTrigger[] = []
  for (const t of raw) {
    const regulationId = t.regulationId.trim()
    const triggerId = t.triggerId.trim()
    const key = `${regulationId}:${triggerId}`
    const choice = byKey.get(key)
    if (!choice || seen.has(key) || !fits(choice, row)) continue
    seen.add(key)
    out.push({ regulationId, triggerId })
  }
  return out.slice(0, MAX_TRIGGERS_PER_ROW)
}

export const TRIGGER_PROPOSED = 'TRIGGER_PROPOSED'

/**
 * A model-placed trigger starts a clock when the row is delivered, so each one is flagged for the
 * designer to confirm that the row really is that moment (Row actions, Starts reporting clocks).
 */
export function triggerNotes(
  rows: readonly MselRow[],
  choices: readonly TriggerChoice[],
): LintWarning[] {
  return rows.flatMap((row) =>
    (row.triggers ?? []).flatMap((t) => {
      const c = choices.find(
        (x) => x.regulationId === t.regulationId && x.triggerId === t.triggerId,
      )
      if (!c) return []
      return [
        {
          code: TRIGGER_PROPOSED,
          severity: 'info' as const,
          source: 'lint' as const,
          rowId: row.id,
          message: `${row.id} starts the ${c.regulation} clock "${c.label}", as proposed while the rows were written. Delivering the row starts it in Facilitate.`,
          suggestion:
            'Check that this row is that moment, or remove it under Row actions, Starts reporting clocks.',
        },
      ]
    }),
  )
}
