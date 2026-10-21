// Brief form state <-> ScenarioBrief. Kept as strings while editing; validated on submit.
import type { ScenarioBrief, ScenarioIdea } from '@shared/schemas/scenario'

export interface BriefDraft {
  userPrompt: string
  audience: string[]
  durationHours: string
  phaseCount: string
  learningObjectives: string[]
  constraints: string[]
  startWallClock: string
  ideaId?: string
}

export type BriefErrors = Partial<Record<keyof BriefDraft, string>>

export const emptyDraft = (): BriefDraft => ({
  userPrompt: '',
  audience: [],
  durationHours: '4',
  phaseCount: '4',
  learningObjectives: [],
  constraints: [],
  startWallClock: '09:00',
})

/** Prefill the brief from a "Give me ideas" card so the user can refine it. */
export function draftFromIdea(idea: ScenarioIdea, base: BriefDraft = emptyDraft()): BriefDraft {
  const lines = [`${idea.title}: ${idea.hook}`]
  if (idea.threat) lines.push(`Threat: ${idea.threat}`)
  if (idea.systemsAffected.length)
    lines.push(`Systems affected: ${idea.systemsAffected.join(', ')}`)
  return {
    ...base,
    userPrompt: lines.join('\n'),
    audience: idea.suggestedRoles.length ? [...idea.suggestedRoles] : base.audience,
    learningObjectives: idea.whyItTeaches ? [idea.whyItTeaches] : base.learningObjectives,
    constraints: idea.sectionsExercised.map((c) => `Must test ${c.headingPath}`),
    ideaId: idea.id,
  }
}

const clean = (items: string[]) => items.map((s) => s.trim()).filter(Boolean)
const WALL_CLOCK = /^([01]?\d|2[0-3]):[0-5]\d$/

export function validateDraft(d: BriefDraft): BriefErrors {
  const errors: BriefErrors = {}
  if (!d.userPrompt.trim()) errors.userPrompt = 'Describe the threat or theme to exercise.'
  const hours = Number(d.durationHours)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
    errors.durationHours = 'More than 0 and at most 24 hours.'
  const phases = Number(d.phaseCount)
  if (!Number.isInteger(phases) || phases < 1 || phases > 8)
    errors.phaseCount = 'A whole number from 1 to 8.'
  if (d.startWallClock && !WALL_CLOCK.test(d.startWallClock))
    errors.startWallClock = 'Use HH:MM, e.g. 09:00.'
  return errors
}

export function toBrief(d: BriefDraft): ScenarioBrief {
  return {
    userPrompt: d.userPrompt.trim(),
    audience: clean(d.audience),
    durationHours: Number(d.durationHours),
    phaseCount: Number(d.phaseCount),
    learningObjectives: clean(d.learningObjectives),
    constraints: clean(d.constraints),
    ...(d.ideaId ? { ideaId: d.ideaId } : {}),
    ...(d.startWallClock ? { startWallClock: d.startWallClock } : {}),
  }
}

/** Errors that mean "set up a provider first" rather than "fix your input". */
export function isProviderError(e: { code?: string; message: string }): boolean {
  return e.code === 'PROVIDER' || /provider|not routed|no model/i.test(e.message)
}
