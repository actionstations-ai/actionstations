import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { ScenarioBrief, ScenarioIdea, Stage } from '../schemas/scenario'

const P = z.object({ projectPath: z.string().min(1) })
const JobRef = z.object({ jobId: SafeId })

export const generateChannels = {
  'generate:ideas': channel(
    P.extend({
      brief: ScenarioBrief.partial().default({}),
      count: z.number().int().min(1).max(12).default(6),
      /** "From plan seams" (#427): build ideas around the open plan conflicts. */
      fromSeams: z.boolean().default(false),
    }),
    JobRef,
  ),
  'generate:ideas-result': channel(P, z.array(ScenarioIdea)),
  'generate:scenario': channel(
    P.extend({ brief: ScenarioBrief, idea: ScenarioIdea.optional() }),
    z.object({ jobId: SafeId, scenarioId: SafeId }),
  ),
  'generate:rerun-stage': channel(
    P.extend({
      scenarioId: SafeId,
      stage: Stage,
      itemId: SafeId.optional(),
      instructions: z.string().optional(),
    }),
    JobRef,
  ),
  'generate:continue': channel(P.extend({ scenarioId: SafeId }), JobRef),
  'generate:injects': channel(
    P.extend({ scenarioId: SafeId, rowIds: z.array(SafeId).optional() }),
    JobRef,
  ),
  /**
   * One proposed row for a branch (spec 0430 FR-10). The job result is a ProposalResult; the
   * scenario is not changed: a person accepts the row and the renderer saves it.
   */
  'generate:propose-inject': channel(
    P.extend({
      scenarioId: SafeId,
      branchId: SafeId,
      afterRowId: z.string().max(64).optional(),
      instructions: z.string().max(1000).optional(),
    }),
    JobRef,
  ),
  'generate:media': channel(
    P.extend({
      scenarioId: SafeId,
      injectIds: z.array(SafeId).optional(),
      paths: z.array(z.enum(['template', 'ai_image', 'ai_video', 'tts'])).optional(),
    }),
    JobRef,
  ),
  /**
   * Repair a finished scenario in place (#185): MSEL repairs and the revision pass for
   * flagged rows only, then injects and media for what changed. `aiStills` caps the AI stills
   * rendered for injects that plan one and have none (default: all of them).
   */
  'generate:repair': channel(
    P.extend({ scenarioId: SafeId, aiStills: z.number().int().min(0).max(100).optional() }),
    JobRef,
  ),
}
