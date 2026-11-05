// Classroom evidence, scoring and rotation channels (#724, #727, #730, spec 0453). Scores are
// the instructor's: the suggestion is a rule-based proposal with its basis, never a grade.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { CLASSROOM_LIMITS, Evidence, RotationPlan } from '../schemas/classroom'
import { ClassroomState } from './classroom'

const P = z.object({ projectPath: z.string().min(1) })
const S = P.extend({ scenarioId: SafeId })

const EvidenceInput = Evidence.omit({ id: true, at: true }).extend({
  id: SafeId.optional(),
  at: Evidence.shape.at.optional(),
})

export const ScoringCell = z.object({
  rubricId: SafeId,
  criterionId: SafeId,
  /** Evidence attached to this student and criterion. */
  evidence: z.array(Evidence),
  suggestedLevel: z.number().int().nullable(),
  basis: z.string(),
  /** The level that counts for this student (their own, or the team's). */
  level: z.number().int().nullable(),
  fromTeam: z.boolean(),
  overridden: z.boolean(),
  comment: z.string(),
})
export type ScoringCell = z.infer<typeof ScoringCell>

export const ScoringStudent = z.object({
  studentId: SafeId,
  name: z.string(),
  cells: z.array(ScoringCell),
  totals: z.array(
    z.object({
      rubricId: SafeId,
      points: z.number(),
      maxPoints: z.number(),
      fraction: z.number().nullable(),
      complete: z.boolean(),
    }),
  ),
  outcomes: z.array(z.object({ outcomeId: SafeId, fraction: z.number().nullable() })),
  /** Evidence not yet attached to a criterion (decisions to link, hot wash tallies). */
  unlinked: z.array(Evidence),
})
export type ScoringStudent = z.infer<typeof ScoringStudent>

export const ScoringView = z.object({
  scenarioId: SafeId,
  sectionId: SafeId.nullable(),
  practice: z.boolean(),
  rubricIds: z.array(SafeId),
  students: z.array(ScoringStudent),
  /** The team's own cells (team rubrics), under the team id. */
  team: z.array(ScoringCell),
})
export type ScoringView = z.infer<typeof ScoringView>

export const RotationResultView = z.object({
  plan: RotationPlan,
  problems: z.array(z.string()),
})

export const classroomScoringChannels = {
  'classroom:evidence-add': channel(P.extend({ evidence: EvidenceInput }), z.array(Evidence)),
  'classroom:evidence-list': channel(S.extend({ studentId: SafeId.optional() }), z.array(Evidence)),
  /** Attach a decision, tally or note to a rubric criterion after the fact. */
  'classroom:evidence-link': channel(
    P.extend({
      evidenceId: SafeId,
      rubricId: SafeId,
      criterionId: SafeId,
      levelIndex: z.number().int().min(0).max(5).optional(),
    }),
    z.array(Evidence),
  ),
  'classroom:evidence-remove': channel(P.extend({ evidenceId: SafeId }), z.array(Evidence)),
  /** One tap, one hot wash contribution for one student. */
  'classroom:hotwash-tally': channel(
    S.extend({ studentId: SafeId, note: z.string().max(200).optional() }),
    Evidence,
  ),
  'classroom:scoring-view': channel(S.extend({ sectionId: SafeId.optional() }), ScoringView),
  /** Choose a level for one student (or the team) on one criterion. */
  'classroom:set-score': channel(
    S.extend({
      studentId: SafeId,
      rubricId: SafeId,
      criterionId: SafeId,
      levelIndex: z.number().int().min(0).max(5),
      comment: z.string().max(CLASSROOM_LIMITS.note).default(''),
      scoredBy: z.string().max(60).optional(),
    }),
    ScoringView,
  ),
  'classroom:clear-score': channel(
    S.extend({ studentId: SafeId, rubricId: SafeId, criterionId: SafeId }),
    ScoringView,
  ),
  'classroom:set-reflection-prompts': channel(
    P.extend({
      prompts: z.array(z.string().trim().min(1).max(CLASSROOM_LIMITS.text)).min(2).max(5),
    }),
    ClassroomState,
  ),
  /**
   * Save (or refresh) the scenario's reflection survey from the course's prompts. Open it from
   * the live Surveys panel: its answers are linked to the student, for the instructor only.
   */
  'classroom:reflection-survey': channel(S, z.object({ surveyId: SafeId })),
  /**
   * Start a make-up version of a scenario: a new scenario with the same objectives, mapped
   * outcomes and rubrics, and different facts, generated through the normal stages.
   */
  'classroom:create-makeup': channel(S, z.object({ scenarioId: SafeId, jobId: SafeId })),
  /** Plan roles for a section across sessions, keeping hand-locked assignments, and save it. */
  'classroom:rotation-plan': channel(
    P.extend({
      sectionId: SafeId,
      roles: z.array(z.string().min(1).max(80)).min(1).max(30),
      sessions: z.number().int().min(1).max(CLASSROOM_LIMITS.rotationSessions),
      locked: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    }),
    RotationResultView,
  ),
}
