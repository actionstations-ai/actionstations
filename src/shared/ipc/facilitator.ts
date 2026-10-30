import { z } from 'zod'
import { channel } from './define'
import { ExerciseTime, IsoDateTime, SafeId } from '../schemas/common'
import { BranchRule } from '../schemas/scenario'
import { HotwashItemKind } from '../schemas/aar'
import { ComplianceSession } from '../schemas/compliance'
import { LiveConnection } from '../schemas/live'
import { SimcellExchange } from '../schemas/persona'

const S = z.object({ projectPath: z.string(), scenarioId: SafeId })

/** One clock change (spec 0428 FR-4): what happened, from and to which exercise minute. */
export const ClockLogEntry = z.object({
  at: IsoDateTime,
  kind: z.enum(['start', 'pause', 'set', 'nudge', 'rate', 'reset', 'jump']),
  fromMin: z.number(),
  toMin: z.number(),
  rate: z.number(),
  note: z.string().max(200).optional(),
})
export type ClockLogEntry = z.infer<typeof ClockLogEntry>

/** Where an inject was answered (spec 0428 FR-14). */
export const TrackerResponse = z.object({
  at: IsoDateTime,
  exerciseMin: z.number(),
  by: z.string().max(120).optional(),
  note: z.string().max(500).default(''),
  source: z.enum(['manual', 'message', 'vote', 'note']),
  ref: z.string().max(120).optional(),
})

/** A promise players made (spec 0428 FR-15). */
export const Commitment = z.object({
  id: SafeId,
  text: z.string().max(500),
  owner: z.string().max(120).default(''),
  madeAtMin: z.number(),
  dueAtMin: z.number().optional(),
  rowId: z.string().max(64).optional(),
  source: z.enum(['manual', 'message', 'note', 'transcript', 'model']),
  sourceRef: z.string().max(120).optional(),
  status: z.enum(['open', 'kept', 'missed', 'dropped']),
  closedAtMin: z.number().optional(),
})
export type Commitment = z.infer<typeof Commitment>

/** A commitment the detector found and the facilitator has not accepted yet. */
export const CommitmentSuggestion = z.object({
  id: SafeId,
  text: z.string().max(500),
  dueAtMin: z.number().optional(),
  rowId: z.string().max(64).optional(),
  source: z.enum(['message', 'note', 'transcript', 'model']),
  sourceRef: z.string().max(120).optional(),
})
export type CommitmentSuggestion = z.infer<typeof CommitmentSuggestion>

export const TrackerState = z.object({
  responses: z.record(z.string(), TrackerResponse).default({}),
  commitments: z.array(Commitment).max(500).default([]),
  suggestions: z.array(CommitmentSuggestion).max(200).default([]),
  dismissed: z
    .record(z.string(), z.object({ at: IsoDateTime, reason: z.string().max(300).default('') }))
    .default({}),
  /** Row ids whose notes were already scanned, by note text length+hash. */
  scanned: z.record(z.string(), z.string()).default({}),
})
export type TrackerState = z.infer<typeof TrackerState>

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
    .record(
      z.string(),
      z.object({
        at: z.string(),
        exerciseTime: z.string(),
        /** Role ids it was delivered to when the facilitator changed the plan (spec 0428 FR-6). */
        recipients: z.array(SafeId).max(200).optional(),
      }),
    )
    .default({}),
  /** Clock speed, 1 = real time (spec 0428 FR-2); absent = 1. */
  rate: z.number().min(0.25).max(60).optional(),
  /** Every clock change, newest last, capped at 5000 (spec 0428 FR-4). */
  clockLog: z.array(ClockLogEntry).max(5000).optional(),
  /** Unanswered injects and commitments (spec 0428 FR-13..15); absent = none yet. */
  tracker: TrackerState.optional(),
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
  /** SimCell exchanges typed in without live play, kept for the hot wash (spec 0429 FR-15). */
  simcell: z.array(SimcellExchange).max(500).optional(),
  /** Branch decisions taken and proposals seen this run (spec 0430); absent without branches. */
  branching: z
    .object({
      seed: SafeId.optional(),
      decisions: z.array(DecisionRecord).max(500).default([]),
      proposals: z.array(ProposalVerdict).max(500).default([]),
    })
    .optional(),
  /**
   * Live play (#410): the connection chosen for this exercise and the remote kinds the facilitator
   * confirmed. Absent connection means "not chosen": nothing listens or connects.
   */
  live: z
    .looseObject({
      connection: LiveConnection.optional(),
      consented: z
        .array(z.enum(['relay', 'self-hosted']))
        .max(2)
        .optional(),
    })
    .optional(),
  /** The Map tab (#436): which map is shown and whether upcoming rows are drawn. */
  map: z.object({ mapId: SafeId.optional(), showUpcoming: z.boolean().default(false) }).optional(),
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
      /** An engagement render (`render:engagement`) to show in place of the stored asset. */
      cachePath: z.string().max(300).optional(),
      displayId: z.number().optional(),
    }),
    z.void(),
  ),
  /** Show a branch decision in the presentation window (spec 0430). */
  'facilitator:present-decision': channel(
    S.extend({ decisionId: SafeId, displayId: z.number().optional() }),
    z.void(),
  ),
  /** Show a map with only the delivered pins in the presentation window (#500, spec 0436 FR-8). */
  'facilitator:present-map': channel(
    S.extend({ mapId: SafeId, displayId: z.number().optional() }),
    z.void(),
  ),
  'facilitator:close-present': channel(z.void(), z.void()),
  /** Whether the presentation window is open (changes arrive as facilitator:present-changed). */
  'facilitator:present-status': channel(z.void(), z.object({ open: z.boolean() })),
}

export const PresentChangedEvent = z.object({ open: z.boolean() })
