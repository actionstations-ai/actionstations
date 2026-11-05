// Toolkits over IPC (ADR-0074, spec 0448): the toolkits the enabled packs provide, which are on
// for a scenario, the suggestions the brief and the domain give, and the switches.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { ToolkitId, ToolkitSchema, ToolkitSource } from '../toolkits/schema'

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
}
