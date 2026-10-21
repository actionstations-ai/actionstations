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
  'generate:media': channel(
    P.extend({
      scenarioId: SafeId,
      injectIds: z.array(SafeId).optional(),
      paths: z.array(z.enum(['template', 'ai_image', 'ai_video', 'tts'])).optional(),
    }),
    JobRef,
  ),
}
