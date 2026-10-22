// Control cards (STARTEX / TIME JUMP / ENDEX) built from the MSEL row when the model's
// inject_text reply fails twice (#166). The row already says what the facilitator reads and
// the clock it moves to, so a card made from it is playable; the page carries a warning and
// the failed run stays on the scenario, so the next gap-filling run regenerates it.
import type { MselRow } from '@shared/schemas'

type Fields = Record<string, unknown>

const CONTROL_LABEL =
  /^\s*(?:STARTEX|ENDEX|END ?GAME|(?:TIME|SCENARIO|CLOCK)[ _-]?JUMP)\s*[:—-]\s*/i
const NEW_TIME =
  /\b(?:it is now|it's now|clock (?:moves|jumps) to|now)\s+(\d{1,2}[:.]\d{2}(?:\s*[ap]\.?m\.?)?)/i

/** What the facilitator reads: the row's event without its "Time Jump:" style label. */
export function controlNarration(row: MselRow): string {
  return row.event.replace(CONTROL_LABEL, '').trim() || row.event.trim()
}

/** The clock a time jump moves to: the event's "It is now 13:15", else the row's clock. */
export function jumpTime(row: MselRow): string {
  return (
    NEW_TIME.exec(row.event)?.[1]
      ?.trim()
      .replace(/(?<=[AP]M)\.$/i, '') ??
    row.wallClock ??
    row.time
  )
}

/** Sentences after the first, as the world-state bullets the card lists. */
function worldState(narration: string): string[] {
  return narration
    .split(/(?<=[.!?])\s+/)
    .slice(1)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Fields for a control-card type built from the row alone; undefined for other types. */
export function controlCardFields(type: string, row: MselRow, title: string): Fields | undefined {
  const narration = controlNarration(row)
  const base = { exerciseTime: row.time, scenarioTitle: title, injectId: row.id }
  switch (type) {
    case 'time_jump_card': {
      const state = worldState(narration)
      return {
        ...base,
        newTime: jumpTime(row),
        narration,
        ...(state.length ? { worldState: state } : {}),
      }
    }
    case 'startex_card':
      return { ...base, startTime: row.wallClock ?? row.time, narration }
    case 'endex_card':
      return {
        ...base,
        ...(row.wallClock ? { endTime: row.wallClock } : {}),
        resolution: narration,
      }
    default:
      return undefined
  }
}
