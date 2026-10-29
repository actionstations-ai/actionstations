// simcell:* (#429): persona cards, the capability check, drafts and the approval queue, offline
// turns, and voice calls. Drafts are staff-only: nothing here reaches a player until a person
// resolves a draft with `send`, `edit` or `rewrite`.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { CapabilityResult, PersonasFile, SimcellDraft } from '../schemas/persona'

const S = z.object({ projectPath: z.string().min(1), scenarioId: SafeId })
const JobStarted = z.object({ jobId: SafeId })

export const SimcellStatus = z.object({
  enabled: z.boolean(),
  level: z.enum(['suited', 'limited', 'not_suited']).optional(),
  failed: z.array(z.string()),
  /** True while a live session runs for this scenario. */
  live: z.boolean(),
  keepRecordings: z.boolean(),
})
export type SimcellStatus = z.infer<typeof SimcellStatus>

export const WaitingMessage = z.object({
  threadId: z.string(),
  label: z.string(),
  text: z.string(),
  at: z.number(),
  personaId: SafeId.optional(),
})
export type WaitingMessage = z.infer<typeof WaitingMessage>

export const SimcellQueue = z.object({
  drafts: z.array(SimcellDraft),
  /** Player messages that have no draft yet (not routed, or drafting is on request only). */
  waiting: z.array(WaitingMessage),
  status: SimcellStatus,
})
export type SimcellQueue = z.infer<typeof SimcellQueue>

export const CapabilityView = CapabilityResult.extend({
  providerId: z.string(),
  model: z.string(),
  /** Probe id to the sentence the guide uses for it. */
  labels: z.record(z.string(), z.string()),
})
export type CapabilityView = z.infer<typeof CapabilityView>

export const simcellChannels = {
  'simcell:personas-get': channel(S, PersonasFile),
  /** Name checks may refuse a card with VALIDATION (a real person's name). */
  'simcell:personas-save': channel(S.extend({ file: PersonasFile }), PersonasFile),
  /** Cards from the scenario's SimCell scripts. With `enrich`, a job asks the model to fill them in. */
  'simcell:personas-from-scripts': channel(
    S.extend({ enrich: z.boolean().default(false) }),
    z.object({ proposal: PersonasFile.optional(), jobId: SafeId.optional() }),
  ),
  /** The cached level for the model routed to `roleplay`, if it was checked. */
  'simcell:capability': channel(
    z.object({ projectPath: z.string().min(1).optional() }),
    CapabilityView.nullable(),
  ),
  /** Run the eight probes now (a job). */
  'simcell:capability-run': channel(
    z.object({ projectPath: z.string().min(1).optional() }),
    JobStarted,
  ),
  'simcell:status': channel(S, SimcellStatus),
  /** Turn drafting on or off for the session; turning it on checks the model first. */
  'simcell:set-options': channel(
    S.extend({ enabled: z.boolean().optional(), keepRecordings: z.boolean().optional() }),
    SimcellStatus,
  ),
  /** Draft a reply now (or regenerate one with an instruction). */
  'simcell:draft': channel(
    S.extend({
      personaId: SafeId,
      threadId: z.string().max(80),
      instruction: z.string().trim().max(300).optional(),
      replaces: SafeId.optional(),
    }),
    SimcellDraft,
  ),
  'simcell:queue': channel(S, SimcellQueue),
  /** Choose the persona for a thread (its later player messages are routed to it). */
  'simcell:assign': channel(
    S.extend({ threadId: z.string().max(80), personaId: SafeId }),
    z.void(),
  ),
  'simcell:resolve': channel(
    S.extend({
      draftId: SafeId,
      action: z.enum(['send', 'edit', 'rewrite', 'discard']),
      text: z.string().max(2000).optional(),
      /** The thread to send to, for a draft that was not addressed (a deadline). */
      channel: z.string().max(80).optional(),
      /** Ring the players with the reply as a call instead of posting a message. */
      asCall: z.boolean().optional(),
    }),
    SimcellDraft,
  ),
  /** FR-15: what a player asked on the phone; the reply is a draft to read aloud. */
  'simcell:offline-turn': channel(
    S.extend({ personaId: SafeId, playerText: z.string().trim().min(1).max(4000) }),
    SimcellDraft,
  ),
  /** Speak a line in a persona's voice; the file is under the scenario's media folder. */
  'simcell:voice-render': channel(
    S.extend({ personaId: SafeId, text: z.string().trim().min(1).max(1500) }),
    z.object({ assetPath: z.string(), durationSec: z.number() }),
  ),
  /** Ring a role, team or device with a line from a persona (a new call). */
  'simcell:call-start': channel(
    S.extend({
      personaId: SafeId,
      threadId: z.string().max(80),
      text: z.string().trim().min(1).max(2000),
    }),
    z.object({ callId: z.string(), turn: z.number() }),
  ),
  'simcell:call-end': channel(S.extend({ callId: z.string().max(40) }), z.void()),
}

export const simcellEvents = {
  'simcell:draft-ready': z.object({ scenarioId: z.string(), draftId: z.string() }),
  'simcell:queue-changed': z.object({ scenarioId: z.string() }),
}
