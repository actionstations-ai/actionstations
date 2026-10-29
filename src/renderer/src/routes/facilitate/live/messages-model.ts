// What the SimCell messages panel needs to decide, kept pure (spec 0413 FR-4, FR-5, FR-10).
import type { Scenario, SimcellScript } from '@shared/schemas/scenario'

export const DEFAULT_PERSONAS = ['SimCell', 'Controller'] as const

/** Personas to pick from: the scripts' `rolePlayed`, the distinct MSEL senders, then the defaults. */
export function personaOptions(
  scenario: Pick<Scenario, 'simcellScripts' | 'msel'>,
  extra: readonly string[] = [],
): string[] {
  const seen = new Map<string, string>()
  const add = (name: string | undefined) => {
    const clean = name?.trim().slice(0, 80)
    if (clean && !seen.has(clean.toLowerCase())) seen.set(clean.toLowerCase(), clean)
  }
  for (const s of scenario.simcellScripts) add(s.rolePlayed)
  for (const row of scenario.msel) add(row.from)
  for (const d of DEFAULT_PERSONAS) add(d)
  for (const e of extra) add(e)
  return [...seen.values()]
}

/** The SimCell script for a persona (case-insensitive on `rolePlayed`). */
export function scriptFor(
  scenario: Pick<Scenario, 'simcellScripts'>,
  persona: string,
): SimcellScript | undefined {
  const want = persona.trim().toLowerCase()
  return scenario.simcellScripts.find((s) => s.rolePlayed.trim().toLowerCase() === want)
}

/** "waiting 4 min": whole minutes, at least 1. */
export function waitingLabel(since: number, now: number): string {
  const minutes = Math.max(1, Math.floor((now - since) / 60_000))
  return `waiting ${minutes} min`
}
