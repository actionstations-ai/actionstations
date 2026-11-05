// Triage methods as decision functions over a patient's findings (spec 0456 FR-3, FR-9). START and
// JumpSTART follow the algorithm as published by secondary sources; SALT is simplified from
// secondary sources too, since its primary paper (Lerner and colleagues, 2008) has not been
// checked against this code: confirm it before relying on SALT outcomes. The exercise names the
// method players use; none of this is clinical guidance.

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
  if (f.capillaryRefillSeconds > 2) return 'Immediate'
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

/** SALT (simplified): sort walkers, assess the rest, with the lifesaving interventions done. */
export function triageSalt(f: Findings): TriagePriority {
  if (f.walks) return 'Minor'
  if (!f.breathing) return 'Deceased'
  if (f.lethalInjury) return 'Expectant'
  if (!f.obeysCommands || !f.radialPulse || f.respiratoryDistress || !f.hemorrhageControlled)
    return 'Immediate'
  return 'Delayed'
}

export function triage(method: TriageMethod, f: Findings): TriagePriority {
  if (method === 'SALT') return triageSalt(f)
  return f.ageYears < PEDIATRIC_AGE_LIMIT ? triageJumpStart(f) : triageStart(f)
}

/** The method's steps as data, for the knowledge pages and the handbook. */
export const TRIAGE_STEPS: Record<TriageMethod, string[]> = {
  START: [
    'Walks: Minor.',
    'Not breathing after the airway is opened: Expectant.',
    'Breathing over 30 a minute: Immediate.',
    'Capillary refill over 2 seconds: Immediate.',
    'Cannot follow simple commands: Immediate.',
    'Otherwise: Delayed.',
  ],
  SALT: [
    'Sort: walkers are Minor.',
    'Assess: not breathing is Deceased; injuries unlikely to be survived is Expectant.',
    'Not obeying, no radial pulse, respiratory distress or uncontrolled bleeding: Immediate.',
    'Otherwise: Delayed.',
  ],
}
