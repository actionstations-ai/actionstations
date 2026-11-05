// The education record of a simulation session (spec 0452 FR-13, FR-16): that each of the four
// cornerstones of simulation practice (prebriefing, facilitation, professional integrity and
// debriefing, as named in the INACSL Healthcare Simulation Standards of Best Practice, which are
// cited and not reproduced) was done, and by whom, with the hours of simulation. Hours are counted
// for the program's own use; whether simulation counts toward clinical requirements is set by the
// program and its state board, which this app does not decide. Stored as
// <project>/education-records/<id>.json (loose, ADR-0016).
import { z } from 'zod'
import { IsoDateTime, SafeId } from './common'

export const CORNERSTONES = [
  'prebrief',
  'facilitation',
  'professional_integrity',
  'debrief',
] as const
export const Cornerstone = z.enum(CORNERSTONES)
export type Cornerstone = z.infer<typeof Cornerstone>

export const CORNERSTONE_LABELS: Record<Cornerstone, string> = {
  prebrief: 'Prebriefing',
  facilitation: 'Facilitation',
  professional_integrity: 'Professional integrity',
  debrief: 'Debriefing',
}

export const EDUCATION_HOURS_NOTE =
  'Hours are counted for the program’s own use. Whether simulation counts toward clinical requirements is set by the program and its state board of nursing; this app does not decide it.'

export const CornerstoneRecord = z.object({
  done: z.boolean().default(false),
  by: z.string().max(120).optional(),
  at: IsoDateTime.optional(),
  note: z.string().max(500).optional(),
})
export type CornerstoneRecord = z.infer<typeof CornerstoneRecord>

export const EducationRecord = z.object({
  id: SafeId,
  title: z.string().min(1).max(200),
  /** The case study this session used, if any. */
  caseId: SafeId.optional(),
  /** Day of the session, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Simulation hours for this session (the learners' time in the scenario, prebrief and debrief). */
  hours: z.number().min(0).max(24),
  facilitator: z.string().max(120).default(''),
  participants: z.number().int().min(0).max(500).default(0),
  objectives: z.array(z.string().max(300)).max(10).default([]),
  cornerstones: z.object({
    prebrief: CornerstoneRecord.default({ done: false }),
    facilitation: CornerstoneRecord.default({ done: false }),
    professional_integrity: CornerstoneRecord.default({ done: false }),
    debrief: CornerstoneRecord.default({ done: false }),
  }),
  /** The debrief included a check-in with learners (psychological safety). */
  debriefCheckIn: z.boolean().default(false),
  /** Learners saw the content notice and the choice to opt out, where the case has one. */
  contentNoticeShown: z.boolean().default(false),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type EducationRecord = z.infer<typeof EducationRecord>
