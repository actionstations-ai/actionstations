// grounding:* and plan-check:* (#423): grounding labels on generated items, optional model
// verification, user overrides, and the plan check that finds contradictions between plans.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { GroundingResult, ScenarioGrounding, SettableGroundingLabel } from '../schemas/grounding'
import { PlanConflictsFile, PlanFinding, PlanFindingStatus } from '../schemas/plan-conflicts'

const P = z.object({ projectPath: z.string().min(1) })
const S = P.extend({ scenarioId: SafeId })
/** "row:I-07", "inject:<id>", "overview:<n>". */
export const GroundingItemKey = z
  .string()
  .max(160)
  .regex(/^(?:row|inject|overview):[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, 'Invalid item key')

export const groundingChannels = {
  /** The scenario's labels, stale items recomputed (not written; the next save stores them). */
  'grounding:scenario': channel(S, ScenarioGrounding),
  /** Labels of the ideas in ideas.json, by idea id. */
  'grounding:ideas': channel(P, z.record(z.string(), GroundingResult)),
  /** Ask the routed critique provider to judge support (FR-7); job kind grounding-verify. */
  'grounding:verify': channel(
    S.extend({ itemKeys: z.array(GroundingItemKey).max(500).optional() }),
    z.object({ jobId: z.string() }),
  ),
  /** Set or clear (label omitted) the user's label for one item (FR-8). */
  'grounding:override': channel(
    S.extend({
      itemKey: GroundingItemKey,
      label: SettableGroundingLabel.optional(),
      note: z.string().max(1000).optional(),
    }),
    GroundingResult,
  ),
  /** Run the plan check (FR-10); job kind plan-check. */
  'plan-check:run': channel(
    P.extend({ confirmWithModel: z.boolean(), withinDocument: z.boolean().default(false) }),
    z.object({ jobId: z.string() }),
  ),
  /** The last plan check, or null when none ran. */
  'plan-check:get': channel(P, PlanConflictsFile.nullable()),
  /**
   * Whether model confirmation is on by default: on when the critique task routes to a local
   * provider, off (with the reason) when it routes to a cloud one or to none (open question 3).
   */
  'plan-check:defaults': channel(
    P,
    z.object({
      confirmWithModel: z.boolean(),
      providerLabel: z.string().optional(),
      reason: z.string(),
    }),
  ),
  'plan-check:set-status': channel(
    P.extend({
      findingId: z.string().regex(/^[0-9a-f]{16}$/),
      status: PlanFindingStatus.exclude(['outdated']),
      note: z.string().max(1000).optional(),
    }),
    PlanFinding,
  ),
}
