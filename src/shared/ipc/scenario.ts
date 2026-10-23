import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { LintWarning, Scenario, ScenarioBrief, ScenarioDocKind } from '../schemas/scenario'
import { ScenarioMeta } from '../schemas/project'

const S = z.object({ projectPath: z.string().min(1), scenarioId: SafeId })

export const HistoryEntry = z.object({
  id: z.string(),
  at: z.string(),
  by: z.enum(['user', 'ai']),
  note: z.string().optional(),
})
export type HistoryEntry = z.infer<typeof HistoryEntry>

export const scenarioChannels = {
  'scenarios:list': channel(z.object({ projectPath: z.string().min(1) }), z.array(ScenarioMeta)),
  'scenarios:get': channel(S, Scenario),
  'scenarios:save': channel(
    z.object({
      projectPath: z.string().min(1),
      scenario: Scenario,
      note: z.string().optional(),
      /** updatedAt of the copy edited; a newer scenario.json fails with CONFLICT (stale). */
      baseUpdatedAt: z.string().optional(),
    }),
    Scenario,
  ),
  'scenarios:create-empty': channel(
    z.object({
      projectPath: z.string().min(1),
      title: z.string().min(1),
      brief: ScenarioBrief.partial().optional(),
    }),
    Scenario,
  ),
  'scenarios:delete': channel(S, z.void()),
  'scenarios:duplicate': channel(S.extend({ title: z.string().optional() }), Scenario),
  'scenarios:lint': channel(S, z.array(LintWarning)),
  'scenarios:doc-get': channel(
    S.extend({ kind: ScenarioDocKind }),
    z.object({ markdown: z.string() }),
  ),
  'scenarios:doc-save': channel(
    S.extend({ kind: ScenarioDocKind, markdown: z.string(), note: z.string().optional() }),
    z.void(),
  ),
  'scenarios:history': channel(
    S.extend({ artifact: z.union([z.literal('scenario'), ScenarioDocKind]) }),
    z.array(HistoryEntry),
  ),
  /** One history entry's content: `markdown` for a document, `scenario` for the scenario. */
  'scenarios:history-get': channel(
    S.extend({ artifact: z.union([z.literal('scenario'), ScenarioDocKind]), entryId: SafeId }),
    z.object({ markdown: z.string().optional(), scenario: Scenario.optional() }),
  ),
  'scenarios:history-restore': channel(
    S.extend({ artifact: z.union([z.literal('scenario'), ScenarioDocKind]), entryId: SafeId }),
    z.void(),
  ),
}
