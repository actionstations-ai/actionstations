import { z } from 'zod'
import { channel } from './define'
import { ExerciseTime, IsoDateTime, SafeId } from '../schemas/common'
import { BranchRule } from '../schemas/scenario'
import { HotwashItemKind } from '../schemas/aar'
import { ComplianceSession } from '../schemas/compliance'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })

/**
 * One closed branch decision (spec 0430 FR-5): what the rule saw and what it chose. The tally
 * is counts by option, never voter identities. An override is a later record with `supersedes`.
 */
export const DecisionRecord = z.object({
  decisionId: SafeId,
  optionId: SafeId,
  by: z.enum(['vote', 'controller', 'timeout', 'override']),
  rule: BranchRule,
  /** The vote this was decided from, when there was one. */
  voteId: SafeId.optional(),
  input: z.object({
    tally: z.record(SafeId, z.number().int().nonnegative()),
    cast: z.number().int().nonnegative(),
    eligible: z.number().int().nonnegative().optional(),
  }),
  at: IsoDateTime,
  exerciseTime: ExerciseTime,
  note: z.string().max(2000).default(''),
  /** The decisionId of the record this one replaced (override). */
  supersedes: SafeId.optional(),
})
export type DecisionRecord = z.infer<typeof DecisionRecord>

/** A model's proposed inject and what the controller did with it (spec 0430 FR-10). */
export const ProposalVerdict = z.object({
  hash: z.string().max(80),
  rowId: z.string().max(64).optional(),
  verdict: z.enum(['accepted', 'rejected']),
  at: IsoDateTime,
})

/**
 * scenarios/<id>/facilitator.json. A loose object (ADR-0016): live play (#418), controller tools
 * (#428) and other features each add one optional top-level key, and a key this build does not
 * know survives a save by it, so two builds can share the file.
 */
export const FacilitatorState = z.looseObject({
  /** Exercise clock: minutes elapsed when last paused/started, plus wall-clock anchor. */
  elapsedMin: z.number().nonnegative().default(0),
  runningSince: z.string().optional(),
  delivered: z
    .record(z.string(), z.object({ at: z.string(), exerciseTime: z.string() }))
    .default({}),
  notes: z.record(z.string(), z.string()).default({}),
  generalNotes: z.string().default(''),
  /**
   * Hot wash 3-Up / 3-Down items captured in the room (#419, FR-3): the same vocabulary as the
   * live `hotwash.item` message, so an exercise without live play still produces evidence.
   */
  hotwash: z
    .array(
      z.object({
        id: SafeId,
        kind: HotwashItemKind,
        text: z.string().max(4000),
        objectiveRef: z.string().max(128).optional(),
        rowId: z.string().max(64).optional(),
        at: z.string(),
      }),
    )
    .default([]),
  /** Decision log (#419, FR-3): what was decided, when, by which role (never a person). */
  decisions: z
    .array(
      z.object({
        id: SafeId,
        at: z.string(),
        exerciseTime: z.string().max(8).optional(),
        rowId: z.string().max(64).optional(),
        text: z.string().max(4000),
        /** Role id, never a name. */
        byRole: z.string().max(128).optional(),
      }),
    )
    .default([]),
  /** Regulatory clocks: triggers fired, clocks filed or waived, clocks on screen (#426). */
  compliance: ComplianceSession.optional(),
  /** Branch decisions taken and proposals seen this run (spec 0430); absent without branches. */
  branching: z
    .object({
      seed: SafeId.optional(),
      decisions: z.array(DecisionRecord).max(500).default([]),
      proposals: z.array(ProposalVerdict).max(500).default([]),
    })
    .optional(),
})
export type FacilitatorState = z.infer<typeof FacilitatorState>
export type FacilitatorHotwashItem = FacilitatorState['hotwash'][number]
export type FacilitatorDecision = FacilitatorState['decisions'][number]

/** Session log entry kinds the facilitator side writes for branching (spec 0430). */
export const BRANCHING_LOG_KINDS = [
  'decision.open',
  'decision.close',
  'decision.override',
  'inject.release',
  'inject.retract',
  'proposal.offer',
  'proposal.accept',
  'proposal.reject',
] as const

export const BranchingLogInput = z.object({
  kind: z.enum(BRANCHING_LOG_KINDS),
  ex: ExerciseTime.optional(),
  rowId: SafeId.optional(),
  data: z.record(z.string(), z.unknown()).default({}),
})
export type BranchingLogInput = z.infer<typeof BranchingLogInput>

/** What the replay check found (spec 0430 FR-9). */
export const BranchingReplayResult = z.object({
  status: z.enum(['matches', 'mismatch', 'no_decisions', 'scenario_changed', 'no_log']),
  message: z.string(),
  stateHash: z.string().optional(),
  firstDivergence: z.object({ i: z.number().int().optional(), reason: z.string() }).optional(),
})
export type BranchingReplayResult = z.infer<typeof BranchingReplayResult>

export const facilitatorChannels = {
  /** Appends to the local branching log and returns the hashes the app wrote. */
  'facilitator:branching-append': channel(
    S.extend({ entries: z.array(BranchingLogInput).min(1).max(20) }),
    z.object({ stateHash: z.string(), scenarioHash: z.string() }),
  ),
  /** Replays the local branching log against the scenario and compares with the stored hash. */
  'facilitator:branching-replay': channel(S, BranchingReplayResult),
  'facilitator:state-get': channel(S, FacilitatorState),
  'facilitator:state-save': channel(S.extend({ state: FacilitatorState }), FacilitatorState),
  'facilitator:displays': channel(
    z.void(),
    z.array(
      z.object({
        id: z.number(),
        label: z.string(),
        primary: z.boolean(),
        width: z.number(),
        height: z.number(),
      }),
    ),
  ),
  'facilitator:present': channel(
    S.extend({
      injectId: SafeId,
      assetId: SafeId.optional(),
      displayId: z.number().optional(),
    }),
    z.void(),
  ),
  'facilitator:close-present': channel(z.void(), z.void()),
  /** Whether the presentation window is open (changes arrive as facilitator:present-changed). */
  'facilitator:present-status': channel(z.void(), z.object({ open: z.boolean() })),
}

export const PresentChangedEvent = z.object({ open: z.boolean() })
