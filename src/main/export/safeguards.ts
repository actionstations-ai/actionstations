// Safeguards for sensitive content in an export (spec 0464 FR-13(c)): when the scenario's
// toolkits carry safeguards and the scenario's text hits one of their topics, the player
// briefing opens with the content notice, the Exercise Plan repeats it and the handbook gives
// facilitators the wellbeing check and the stop-and-step-out rule.
import { contentNoticeMarkdown, safeguardNotice, type SafeguardNotice } from '@shared/toolkits'
import type { Scenario } from '@shared/schemas'
import { resolveToolkits } from '../toolkits/registry'
import { briefText } from '../toolkits/scenario'

/** The scenario's own words: brief, objectives, constraints and the MSEL events. */
export function scenarioText(scenario: Scenario): string {
  return [
    briefText(scenario),
    scenario.overview?.theme ?? '',
    scenario.overview?.threat ?? '',
    ...scenario.msel.map((r) => `${r.event}\n${r.expectedAction}`),
  ].join('\n')
}

/** The notice for a scenario; an export never fails because of it. */
export async function loadSafeguards(scenario: Scenario): Promise<SafeguardNotice | undefined> {
  try {
    const toolkits = await resolveToolkits(scenario.toolkits)
    return safeguardNotice(toolkits, scenarioText(scenario))
  } catch (e) {
    console.error('[export] safeguards not read:', (e as Error).message)
    return undefined
  }
}

/** The briefing with the content notice in front (once). */
export function briefingWithNotice(briefing: string, notice: SafeguardNotice | undefined): string {
  if (!notice || /^#{1,3}\s*content notice/im.test(briefing)) return briefing
  return `${contentNoticeMarkdown(notice)}\n\n${briefing}`.trimEnd()
}
