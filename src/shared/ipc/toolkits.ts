// Toolkits over IPC (ADR-0074, spec 0448): the toolkits the enabled packs provide, which are on
// for a scenario, the suggestions the brief and the domain give, and the switches.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { ToolkitId, ToolkitSchema, ToolkitSource } from '../toolkits/schema'
import { DecisionRecord } from '../schemas/decisions'

const P = z.object({ projectPath: z.string().min(1) })
const S = P.extend({ scenarioId: SafeId })

export const ListedToolkit = z.object({
  toolkit: ToolkitSchema,
  source: ToolkitSource,
  /** On for the scenario asked about (always false without a scenario). */
  enabled: z.boolean(),
  /** One line why the app proposes it (brief or domain); absent when it is not proposed. */
  suggestion: z.string().optional(),
})
export type ListedToolkit = z.infer<typeof ListedToolkit>

export const ToolkitList = z.object({
  toolkits: z.array(ListedToolkit),
  /** Toolkit ids the project's new scenarios start with. */
  projectDefault: z.array(ToolkitId),
})
export type ToolkitList = z.infer<typeof ToolkitList>

/**
 * The simulated clinical downtime as Facilitate shows it (issue #1130): the model's figures
 * before and after the decisions, the consequence rules that fired, back-entry by unit and the
 * seeded discrepancies, each due once back-entry reaches its threshold.
 */
export const ClinicalDowntimeView = z.object({
  label: z.string(),
  start: z.string(),
  recoveryAt: z.string(),
  figures: z.array(z.object({ label: z.string(), before: z.number(), now: z.number() })),
  fired: z.array(
    z.object({
      ruleId: z.string(),
      label: z.string(),
      explanation: z.string(),
      overridden: z.boolean(),
    }),
  ),
  units: z.array(
    z.object({ unit: z.string(), done: z.number(), remaining: z.number(), reported: z.boolean() }),
  ),
  percent: z.number(),
  closed: z.boolean(),
  discrepancies: z.array(
    z.object({ id: z.string(), threshold: z.number(), text: z.string(), due: z.boolean() }),
  ),
})
export type ClinicalDowntimeView = z.infer<typeof ClinicalDowntimeView>

export const toolkitChannels = {
  /** Toolkits of the enabled packs with the scenario's switches and suggestions. */
  'toolkits:list': channel(P.extend({ scenarioId: SafeId.optional() }), ToolkitList),
  /** Replace the scenario's toolkit list; unknown ids are refused. Returns the stored list. */
  'toolkits:set-scenario': channel(
    S.extend({ toolkits: z.array(ToolkitId).max(50) }),
    z.array(ToolkitId),
  ),
  /** Replace the list new scenarios of the project start with. Returns the stored list. */
  'toolkits:set-project': channel(
    P.extend({ toolkits: z.array(ToolkitId).max(50) }),
    z.array(ToolkitId),
  ),
  /**
   * The scenario's simulated clinical downtime after these decisions (the session's and the
   * facilitator file's); null when the scenario has no downtime case data.
   */
  'toolkits:clinical-downtime': channel(
    S.extend({ decisions: z.array(DecisionRecord).max(1000) }),
    ClinicalDowntimeView.nullable(),
  ),
}
