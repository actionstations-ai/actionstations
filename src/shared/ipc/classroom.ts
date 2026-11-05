// Classroom channels (#686, spec 0453, ADR-0090): course, sections, roster, seats. Everything
// reads and writes <project>/classroom/ and nothing leaves the project folder.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import {
  ClassroomCourseFile,
  ClassroomSession,
  Student,
  CLASSROOM_LIMITS,
} from '../schemas/classroom'

const P = z.object({ projectPath: z.string().min(1) })

export const ClassroomState = z.object({
  enabled: z.boolean(),
  noticeAcceptedAt: z.string().optional(),
  /** The notice shown before Classroom mode is turned on. */
  notice: z.string(),
  course: ClassroomCourseFile,
})
export type ClassroomState = z.infer<typeof ClassroomState>

export const RosterPreview = z.object({
  rows: z.array(
    z.object({
      name: z.string(),
      institutionId: z.string().optional(),
      email: z.string().optional(),
    }),
  ),
  skipped: z.array(z.object({ line: z.number(), reason: z.string() })),
  ignoredColumns: z.array(z.string()),
})
export type RosterPreview = z.infer<typeof RosterPreview>

const SectionInput = z.object({
  id: SafeId.optional(),
  name: z.string().trim().min(1).max(CLASSROOM_LIMITS.name),
})

export const classroomChannels = {
  'classroom:get': channel(P, ClassroomState),
  /** Turning it on records that the instructor accepted the notice. Records are kept when it is turned off. */
  'classroom:set-enabled': channel(P.extend({ enabled: z.boolean() }), ClassroomState),
  /** Course name, term and sections. A section that still has students cannot be removed. */
  'classroom:set-course': channel(
    P.extend({
      name: z.string().trim().min(1).max(CLASSROOM_LIMITS.name),
      term: z.string().trim().max(60).default(''),
      sections: z.array(SectionInput).max(CLASSROOM_LIMITS.sections),
    }),
    ClassroomState,
  ),
  'classroom:add-student': channel(
    P.extend({
      sectionId: SafeId,
      name: Student.shape.name,
      institutionId: Student.shape.institutionId,
      email: Student.shape.email,
    }),
    ClassroomState,
  ),
  /** Check a pasted or opened CSV without changing the roster. */
  'classroom:roster-preview': channel(
    P.extend({ sectionId: SafeId, csv: z.string().max(600_000) }),
    RosterPreview,
  ),
  'classroom:roster-import': channel(
    P.extend({ sectionId: SafeId, csv: z.string().max(600_000) }),
    ClassroomState,
  ),
  /** Removes the students' roster entries, evidence, scores, reflections and accommodations. */
  'classroom:delete-students': channel(
    P.extend({ studentIds: z.array(SafeId).min(1).max(CLASSROOM_LIMITS.students) }),
    ClassroomState,
  ),
  /** Removes every student and section; outcomes and rubrics stay. */
  'classroom:delete-term': channel(P, ClassroomState),
  /** Which section ran a scenario, who sat where, and whether the run counts. */
  'classroom:set-session': channel(P.extend({ session: ClassroomSession }), ClassroomState),
}
