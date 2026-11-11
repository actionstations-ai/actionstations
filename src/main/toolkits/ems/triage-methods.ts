// Triage methods as decision functions over a patient's findings (spec 0456 FR-3, FR-9). START and
// JumpSTART follow the algorithm as published by secondary sources. SALT follows the published
// guideline's structure (Lerner and colleagues, 2008, as summarized by the workgroup and secondary
// sources): every patient, walkers included, is assessed; only a patient who fails an assessment
// check can be Expectant. Simplifications: walking stands in for "minor injuries only", and the
// JumpSTART rescue-breath step for an apneic child with a pulse is not modeled. The exercise names
// the method players use; none of this is clinical guidance.

export type TriagePriority = 'Immediate' | 'Delayed' | 'Minor' | 'Expectant' | 'Deceased'
export type TriageMethod = 'START' | 'SALT'

/** What a triage provider finds. */
export interface Findings {
  ageYears: number
  walks: boolean
  /** Breathing after the airway is opened. */
  breathing: boolean
  respirationsPerMinute: number
  capillaryRefillSeconds: number
  radialPulse: boolean
  obeysCommands: boolean
  respiratoryDistress: boolean
  hemorrhageControlled: boolean
  /** The injuries are unlikely to be survivable with the resources available. */
  lethalInjury: boolean
}

/** Children below this age are triaged with the pediatric method. */
export const PEDIATRIC_AGE_LIMIT = 8

/** START for adults: walk, breathe, perfuse, obey. */
export function triageStart(f: Findings): TriagePriority {
  if (f.walks) return 'Minor'
  if (!f.breathing) return 'Expectant'
  if (f.respirationsPerMinute > 30) return 'Immediate'
  if (f.capillaryRefillSeconds > 2 || !f.radialPulse) return 'Immediate'
  if (!f.obeysCommands) return 'Immediate'
  return 'Delayed'
}

/** JumpSTART for children: the same steps with child breathing limits. */
export function triageJumpStart(f: Findings): TriagePriority {
  if (f.walks) return 'Minor'
  if (!f.breathing) return 'Expectant'
  if (f.respirationsPerMinute < 15 || f.respirationsPerMinute > 45) return 'Immediate'
  if (!f.radialPulse) return 'Immediate'
  if (!f.obeysCommands) return 'Immediate'
  return 'Delayed'
}

/**
 * SALT (simplified): after the global sort every patient is assessed, with the lifesaving
 * interventions done. A patient who fails any check is Immediate, or Expectant when unlikely to
 * survive with the resources available; one who passes every check is Minimal (walking, standing in
 * for minor injuries only) or Delayed.
 */
export function triageSalt(f: Findings): TriagePriority {
  if (!f.breathing) return 'Deceased'
  const failsCheck =
    !f.obeysCommands || !f.radialPulse || f.respiratoryDistress || !f.hemorrhageControlled
  if (failsCheck) return f.lethalInjury ? 'Expectant' : 'Immediate'
  return f.walks ? 'Minor' : 'Delayed'
}

export function triage(method: TriageMethod, f: Findings): TriagePriority {
  if (method === 'SALT') return triageSalt(f)
  return f.ageYears < PEDIATRIC_AGE_LIMIT ? triageJumpStart(f) : triageStart(f)
}

/** The method's steps as data, for the knowledge pages and the handbook. */
export const TRIAGE_STEPS: Record<TriageMethod, string[]> = {
  START: [
    'Walks: Minor.',
    'Not breathing after the airway is opened: Deceased/Expectant (black tag).',
    'Breathing over 30 a minute: Immediate.',
    'Capillary refill over 2 seconds or no radial pulse: Immediate.',
    'Cannot follow simple commands: Immediate.',
    'Otherwise: Delayed.',
  ],
  SALT: [
    'Sort: walkers are assessed last, those who wave next, the still first. Everyone is assessed.',
    'Assess, after lifesaving interventions: not breathing after the airway is opened is Dead.',
    'Not obeying, no peripheral pulse, respiratory distress or uncontrolled bleeding: Immediate, or Expectant (gray) if unlikely to survive with the resources available.',
    'Passes every check: Minimal (Minor) with minor injuries only, otherwise Delayed.',
  ],
}
