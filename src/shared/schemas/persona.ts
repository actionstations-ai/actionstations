// Persona cards and SimCell drafts (spec 0429). A card says what an outside party wants, by
// when, and what it will and will not say; it has no free-text personality field. A draft is
// text a person must approve before a player sees it.
import { z } from 'zod'
import { ExerciseTime, IsoDateTime, SafeId } from './common'
import { ProviderRef } from './provider'

export const PersonaKind = z.enum([
  'reporter',
  'regulator',
  'vendor',
  'resident',
  'attacker',
  'partner',
  'agency',
  'other',
])
export type PersonaKind = z.infer<typeof PersonaKind>

export const PERSONA_CHANNELS = ['message', 'sms', 'email', 'call'] as const
export const PersonaChannel = z.enum(PERSONA_CHANNELS)
export type PersonaChannel = z.infer<typeof PersonaChannel>

export const PersonaPostFx = z.enum(['radio', 'phone', 'pa', 'terminal_ambience'])

export const EscalationWhen = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time'), at: ExerciseTime }),
  z.object({ kind: z.literal('row_released'), rowId: z.string().max(64) }),
  z.object({ kind: z.literal('no_reply'), minutes: z.number().int().min(1).max(120) }),
  /** Judged by the model, so the draft flags it as such. */
  z.object({ kind: z.literal('player_says'), text: z.string().max(200) }),
])
export type EscalationWhen = z.infer<typeof EscalationWhen>

export const PersonaCard = z.object({
  id: SafeId,
  /** A fictional person, or a title alone ("the Governor's press secretary"). */
  displayName: z.string().trim().min(1).max(80),
  roleTitle: z.string().max(120).default(''),
  organization: z.object({ name: z.string().max(120), fictional: z.boolean() }),
  kind: PersonaKind,
  /** Style only ("formal", "terse"). The prompt treats it as tone, never as intent. */
  register: z.string().max(40).default(''),
  goals: z.array(z.object({ id: SafeId, text: z.string().max(300) })).max(5),
  deadlines: z
    .array(
      z.object({
        id: SafeId,
        at: ExerciseTime,
        wants: z.string().max(300),
        ifMissed: z.string().max(300),
      }),
    )
    .max(5)
    .default([]),
  escalationRules: z
    .array(z.object({ id: SafeId, when: EscalationWhen, then: z.string().max(300) }))
    .max(8)
    .default([]),
  knowledge: z
    .object({
      knows: z.array(z.string().max(300)).max(10).default([]),
      doesNotKnow: z.array(z.string().max(300)).max(10).default([]),
      mustNotReveal: z.array(z.string().max(120)).max(10).default([]),
    })
    .default({ knows: [], doesNotKnow: [], mustNotReveal: [] }),
  concessions: z
    .array(z.object({ id: SafeId, give: z.string().max(300), onlyIf: z.string().max(300) }))
    .max(5)
    .default([]),
  hardQuestions: z.array(z.string().max(300)).max(6).default([]),
  linkedRowIds: z.array(z.string().max(64)).max(50).default([]),
  channels: z.array(PersonaChannel).default(['message']),
  voice: z
    .object({
      providerId: SafeId.optional(),
      voiceId: z.string().max(120).optional(),
      postFx: z.array(PersonaPostFx).max(4).default(['phone']),
    })
    .default({ postFx: ['phone'] }),
  source: z.object({ simcellScriptIndex: z.number().int().min(0) }).optional(),
})
export type PersonaCard = z.infer<typeof PersonaCard>

export const PersonasFile = z.object({
  version: z.literal(1).default(1),
  personas: z.array(PersonaCard).max(20).default([]),
})
export type PersonasFile = z.infer<typeof PersonasFile>

export const SIMCELL_FLAG_CODES = [
  'MUST_NOT_REVEAL',
  'CONCESSION_UNMET',
  'AGREEABLE_DRIFT',
  'BROKE_CHARACTER',
  'UNKNOWN_PERSON_NAME',
  'TOO_LONG',
  'RULE_JUDGED_BY_MODEL',
  'LIMITED_MODEL',
] as const
export const SimcellFlagCode = z.enum(SIMCELL_FLAG_CODES)
export type SimcellFlagCode = z.infer<typeof SimcellFlagCode>

export const SimcellIntent = z.enum(['answer', 'stall', 'refuse', 'escalate', 'concede'])
export type SimcellIntent = z.infer<typeof SimcellIntent>

export const SimcellApplied = z.object({
  goals: z.array(z.string().max(128)).max(10),
  deadlines: z.array(z.string().max(128)).max(10),
  rules: z.array(z.string().max(128)).max(10),
  concessions: z.array(z.string().max(128)).max(10),
})
export type SimcellApplied = z.infer<typeof SimcellApplied>

/** What the model returns for one reply. */
export const SimcellDraftOutput = z.object({
  text: z.string().min(1).max(2000),
  intent: SimcellIntent,
  applied: SimcellApplied,
  concessionEvidence: z.string().max(500).optional(),
  controllerNote: z.string().max(200),
})
export type SimcellDraftOutput = z.infer<typeof SimcellDraftOutput>

/** What the model returns when it fills persona cards from SimCell scripts. */
export const PersonasOutput = z.object({
  personas: z
    .array(
      z.object({
        scriptIndex: z.number().int().min(0),
        displayName: z.string(),
        roleTitle: z.string(),
        organizationName: z.string(),
        organizationFictional: z.boolean(),
        kind: PersonaKind,
        register: z.string(),
        goals: z.array(z.string()),
        deadlines: z.array(z.object({ at: z.string(), wants: z.string(), ifMissed: z.string() })),
        escalationRules: z.array(
          z.object({
            whenKind: z.enum(['time', 'no_reply', 'player_says']),
            at: z.string().optional(),
            minutes: z.number().int().optional(),
            text: z.string().optional(),
            then: z.string(),
          }),
        ),
        knows: z.array(z.string()),
        doesNotKnow: z.array(z.string()),
        mustNotReveal: z.array(z.string()),
        concessions: z.array(z.object({ give: z.string(), onlyIf: z.string() })),
      }),
    )
    .max(20),
})
export type PersonasOutput = z.infer<typeof PersonasOutput>

export const SimcellFlag = z.object({ code: SimcellFlagCode, message: z.string().max(300) })
export type SimcellFlag = z.infer<typeof SimcellFlag>

export const SimcellDraft = z.object({
  id: SafeId,
  personaId: SafeId,
  /** The message thread (`role:<id>`, `team:<slug>`, `client:<ref>`) or `offline`. */
  threadId: z.string().max(80),
  inReplyTo: z.string().max(64).optional(),
  /** The player text the draft answers (staff-only; never sent to players). */
  inReplyToText: z.string().max(4000).optional(),
  trigger: z.enum(['player_message', 'deadline', 'escalation', 'manual', 'call_turn']),
  text: z.string(),
  intent: SimcellIntent,
  applied: SimcellApplied,
  concessionEvidence: z.string().optional(),
  controllerNote: z.string().max(200).default(''),
  flags: z.array(SimcellFlag).default([]),
  providerRef: ProviderRef,
  createdAt: IsoDateTime,
  status: z.enum(['queued', 'sent', 'edited', 'rewritten', 'discarded']),
  /** When the status left `queued`. */
  resolvedAt: IsoDateTime.optional(),
  finalText: z.string().optional(),
  /** Set for a call turn: the call the reply belongs to. */
  callId: z.string().max(40).optional(),
})
export type SimcellDraft = z.infer<typeof SimcellDraft>

export const CAPABILITY_LEVELS = ['suited', 'limited', 'not_suited'] as const
export const CapabilityLevel = z.enum(CAPABILITY_LEVELS)
export type CapabilityLevel = z.infer<typeof CapabilityLevel>

export const CapabilityResult = z.object({
  level: CapabilityLevel,
  passed: z.array(z.string()),
  failed: z.array(z.string()),
  checkedAt: IsoDateTime,
})
export type CapabilityResult = z.infer<typeof CapabilityResult>

/** One exchange kept in facilitator.json for the hot wash (FR-15). */
export const SimcellExchange = z.object({
  id: SafeId,
  at: IsoDateTime,
  personaId: SafeId,
  personaName: z.string().max(80),
  playerText: z.string().max(4000),
  replyText: z.string().max(4000),
})
export type SimcellExchange = z.infer<typeof SimcellExchange>
