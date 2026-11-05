// Triage categories from findings (spec 0452 FR-4): START as the rule the tag must agree with.
// SALT is checked only for contradictions that hold under any method. Pure. Exercise content,
// not clinical guidance.

export type TriageCategory = 'Immediate' | 'Delayed' | 'Minor' | 'Expectant' | 'Deceased'

export interface TriageFindings {
  walking: boolean
  /** Breathing text: a rate ("34 per minute") or "none after airway opened" / "absent". */
  breathing: string
  perfusion: string
  mentalStatus: string
}

const NO_BREATHING = /\b(none|absent|apneic|not breathing|no respirations?)\b/i
const NO_PERFUSION =
  /\b(no|absent|not palpable)\b.*\b(radial|pulse)\b|\bcap(?:illary)? refill\b.*(?:>|over|more than)\s*2|\bdelayed refill\b/i
const NO_COMMANDS =
  /\b(does not|doesn't|cannot|can't|unable to|not) follow|\bunresponsive\b|\bunconscious\b/i

/** The START category the findings give. Breathing absent after repositioning is Deceased. */
export function startCategory(f: TriageFindings): TriageCategory {
  if (f.walking) return 'Minor'
  if (NO_BREATHING.test(f.breathing)) return 'Deceased'
  const rate = /(\d+)\s*(?:per|\/|breaths)/i.exec(f.breathing)
  if (rate && Number(rate[1]) > 30) return 'Immediate'
  if (NO_PERFUSION.test(f.perfusion)) return 'Immediate'
  if (NO_COMMANDS.test(f.mentalStatus)) return 'Immediate'
  return 'Delayed'
}

/**
 * A problem with a tag, or undefined. Expectant may stand in for Immediate (a resource
 * decision), never for a lower category. SALT: a walking casualty is not Immediate, Expectant
 * or Deceased, and a casualty with no breathing is not Minor or Delayed.
 */
export function triageProblem(
  category: TriageCategory,
  method: 'START' | 'SALT',
  f: TriageFindings,
): string | undefined {
  if (method === 'START') {
    const expected = startCategory(f)
    if (category === expected) return undefined
    if (category === 'Expectant' && expected === 'Immediate') return undefined
    return `Under START these findings give ${expected}, but the tag says ${category}`
  }
  if (
    f.walking &&
    (category === 'Immediate' || category === 'Expectant' || category === 'Deceased')
  )
    return `A walking casualty is not ${category}`
  if (NO_BREATHING.test(f.breathing) && (category === 'Minor' || category === 'Delayed'))
    return `A casualty who is not breathing is not ${category}`
  return undefined
}
