/**
 * One zod schema per sealed message type (spec 0406, "Payload schemas"). Sizes are hard caps;
 * the UI specs may choose smaller ones. Named `<Type>Payload` in PascalCase.
 */
import { z } from 'zod'
import { ExerciseTime, SafeId, WallClock } from '../../schemas/common'
import { Base64Url22, Base64UrlBytes, ClientId, Destination, Nonce } from './envelope'
import { BlobRef } from './blob'

const Text = (max: number) => z.string().max(max)
const RoleId = SafeId
const TargetList = z.array(Destination).min(1).max(64)
const EpochMs = z.number().int().positive()
const Int = z.number().int()
const Count = Int.min(0)
const Revision = Int.min(1)

export const ClientKind = z.enum(['player', 'evaluator', 'observer', 'simcell'])
export type ClientKind = z.infer<typeof ClientKind>

/** Kinds whose devices hold the staff key. */
export const STAFF_KINDS: ReadonlySet<ClientKind> = new Set<ClientKind>(['evaluator', 'simcell'])

export const ClockState = z.strictObject({
  elapsedMin: z.number().nonnegative(),
  runningSince: EpochMs.optional(), // absent when paused
  rate: z.number().min(0.25).max(60).default(1),
  reason: z.enum(['start', 'pause', 'set', 'nudge', 'rate', 'reset', 'jump']).optional(),
  startWallClock: WallClock.optional(),
  phaseId: SafeId.optional(),
})
export type ClockState = z.infer<typeof ClockState>

export const JoinPayload = z.strictObject({
  name: Text(60),
  kind: ClientKind,
  requestedRole: RoleId.optional(),
  ecdhPub: Base64UrlBytes(65),
  /** Staff kinds only: HKDF(current staff root, clientId, ecdhPub); the controller recomputes it. */
  staffProof: Base64UrlBytes(32).optional(),
  resume: z.boolean().optional(),
  ua: Text(100).optional(),
})

const RosterEntry = z.strictObject({
  client: ClientId,
  name: Text(60),
  roleId: RoleId.optional(),
  kind: ClientKind,
})

export const WelcomePayload = z.strictObject({
  client: ClientId,
  kind: ClientKind,
  attribution: z.enum(['role', 'named']),
  role: z
    .strictObject({
      id: RoleId,
      name: Text(80),
      abbreviation: Text(12).optional(),
      teamId: SafeId.optional(),
      teamName: Text(80).optional(),
    })
    .optional(),
  sessionName: Text(120),
  scenarioTitle: Text(200),
  clock: ClockState,
  roster: z.array(RosterEntry).max(200),
  features: z.strictObject({
    messages: z.boolean(),
    votes: z.boolean(),
    hotwash: z.boolean(),
    surveys: z.boolean(),
    eval: z.boolean(),
  }),
  hotwash: z
    .strictObject({
      method: Text(60),
      methodDescription: Text(500).optional(),
      questions: z
        .array(z.strictObject({ id: SafeId, topic: Text(80).optional(), text: Text(500) }))
        .max(10),
    })
    .optional(),
  rejected: z
    .strictObject({
      reason: z.enum(['full', 'role_taken', 'not_allowed']),
      message: Text(200),
    })
    .optional(),
})

export const ClockStatePayload = ClockState

export const InjectReleasePayload = z.strictObject({
  releaseId: Base64Url22,
  mselRowId: SafeId,
  injectId: SafeId.optional(),
  title: Text(200),
  injectType: Text(60),
  deliveryMode: z.enum(['hand_to_role', 'display_main_screen', 'play_audio', 'read_aloud']),
  sender: Text(120).optional(),
  text: z.strictObject({
    headline: Text(300).optional(),
    body: Text(20_000),
    altText: Text(2_000),
  }),
  captionsVtt: Text(20_000).optional(),
  /** Staff only: a frame carrying this field must be sealed with the staff key. */
  expectedAction: Text(2_000).optional(),
  exerciseTime: ExerciseTime,
  targets: TargetList,
  media: z.array(BlobRef).max(6),
  expectsResponse: z.boolean().optional(),
})

export const InjectReceiptPayload = z.strictObject({
  releaseId: Base64Url22,
  status: z.enum(['delivered', 'read', 'actioned']),
  at: EpochMs,
})

export const InjectRecallPayload = z.strictObject({
  releaseId: Base64Url22.optional(),
  mselRowId: SafeId,
  reason: z.enum(['rewind', 'withdrawn']),
  text: Text(300).optional(),
  targets: TargetList,
})

export const MessageSendPayload = z.strictObject({
  messageId: Base64Url22,
  channel: Destination,
  text: Text(4_000),
  persona: Text(120).optional(),
  replyTo: Base64Url22.optional(),
  attachments: z.array(BlobRef).max(3),
  echoOf: Base64Url22.optional(),
  fromRole: RoleId.optional(),
  showPlayedBy: z.boolean().optional(),
})

const Option = z.strictObject({ id: SafeId, label: Text(200) })
const Tally = z.strictObject({ optionId: SafeId, count: Count })

export const VoteOpenPayload = z.strictObject({
  voteId: Base64Url22,
  question: Text(500),
  options: z.array(Option).min(2).max(10),
  anonymous: z.boolean(),
  allowChange: z.boolean(),
  closesAt: EpochMs.optional(),
  targets: TargetList,
  rationalePrompt: Text(200).optional(),
  mselRowId: SafeId.optional(),
  tally: z.array(Tally).max(10).optional(),
})

export const VoteCastPayload = z.strictObject({
  voteId: Base64Url22,
  optionId: SafeId,
  rationale: Text(280).optional(),
})

export const VoteClosePayload = z.strictObject({
  voteId: Base64Url22,
  status: z.enum(['closed', 'interrupted']),
  results: z.array(Tally).max(10),
  voted: Count,
  eligible: Count,
  /** Aggregated counts after k-folding; never one entry per ballot. */
  byRole: z
    .array(
      z.strictObject({
        roleId: z.union([RoleId, z.literal('other')]),
        optionId: SafeId,
        count: Count,
      }),
    )
    .max(640)
    .optional(),
  reveal: z.boolean(),
})

const HotwashKind = z.enum(['strength', 'improvement', 'other'])

export const HotwashItemPayload = z
  .strictObject({
    itemId: Base64Url22,
    kind: HotwashKind,
    text: Text(2_000),
    anonymous: z.boolean(),
    objectiveId: SafeId.optional(),
    questionId: SafeId.optional(),
    mselRowId: SafeId.optional(),
    plusOneOf: Base64Url22.optional(),
    retractOf: Base64Url22.optional(),
  })
  .refine((p) => p.text.length > 0 || p.plusOneOf !== undefined || p.retractOf !== undefined, {
    message: 'text may be empty only for a +1 or a retraction',
    path: ['text'],
  })

export const HotwashUpdatePayload = z.strictObject({
  itemId: Base64Url22,
  action: z.enum([
    'accept',
    'group',
    'ungroup',
    'promote',
    'unpromote',
    'hide',
    'restore',
    'edit',
    'tag',
  ]),
  groupId: Base64Url22.optional(),
  groupLabel: Text(120).optional(),
  text: Text(2_000).optional(),
  kind: HotwashKind.optional(),
  roleId: RoleId.optional(),
  plus: Count.optional(),
  objectiveId: SafeId.optional(),
  capability: SafeId.optional(),
  mselRowId: SafeId.optional(),
})

const SurveyQuestion = z.strictObject({
  id: SafeId,
  kind: z.enum(['scale', 'single', 'multi', 'text']),
  text: Text(500),
  options: z.array(Option).max(12).optional(),
  min: Int.optional(),
  max: Int.optional(),
  required: z.boolean(),
})

export const SurveyOpenPayload = z.strictObject({
  surveyId: Base64Url22,
  title: Text(200),
  intro: Text(2_000).optional(),
  questions: z.array(SurveyQuestion).max(30),
  anonymous: z.boolean(),
  targets: TargetList,
  closesAt: EpochMs.optional(),
})

export const SurveyResponsePayload = z.strictObject({
  surveyId: Base64Url22,
  answers: z
    .array(
      z.strictObject({
        questionId: SafeId,
        value: z.union([z.number(), Text(4_000), z.array(SafeId).max(12)]),
      }),
    )
    .max(30),
})

export const SurveyClosePayload = z.strictObject({ surveyId: Base64Url22 })

export const EvalAssignPayload = z.strictObject({
  assignmentId: Base64Url22,
  revision: Revision,
  label: Text(120),
  watch: z.strictObject({
    roleIds: z.array(RoleId).max(64),
    capabilities: z.array(SafeId).max(32),
  }),
  showExpected: z.boolean(),
  tasks: z
    .array(
      z.strictObject({
        id: SafeId,
        capability: SafeId,
        task: Text(500),
        citation: z.strictObject({
          documentTitle: Text(200),
          headingPath: Text(300),
          page: Int.positive().optional(),
        }),
        expectedBy: RoleId.optional(),
        timing: Text(120).optional(),
        rowIds: z.array(SafeId).max(32),
        criterionId: Text(140).optional(),
      }),
    )
    .max(120),
})

export const EvalObservationPayload = z
  .strictObject({
    observationId: Base64Url22,
    revision: Revision,
    kind: z.enum(['task', 'note']).default('task'),
    taskId: SafeId.optional(),
    criterionId: Text(140).optional(),
    capability: SafeId.optional(),
    rating: z.enum(['met', 'partial', 'not_met', 'not_observed']).optional(),
    notes: Text(4_000),
    exerciseTime: ExerciseTime,
    observedAt: EpochMs,
    injectId: SafeId.optional(),
    mselRowId: SafeId.optional(),
  })
  .refine((o) => o.kind === 'note' || (o.taskId !== undefined && o.rating !== undefined), {
    message: 'a task observation needs taskId and rating',
    path: ['taskId'],
  })

export const CallRingPayload = z.strictObject({
  callId: Base64Url22,
  turn: Revision,
  persona: z.strictObject({ name: Text(120), organization: Text(120).optional() }),
  transcript: Text(4_000),
  audio: BlobRef.optional(),
  canSpeak: z.boolean(),
  expectedWaitSec: Int.min(0).optional(),
  injectId: SafeId.optional(),
  mselRowId: SafeId.optional(),
  targets: TargetList,
})

export const CallAnswerPayload = z
  .strictObject({
    callId: Base64Url22,
    turn: Revision,
    text: Text(4_000).optional(),
    audio: BlobRef.optional(),
  })
  .refine((a) => a.text !== undefined || a.audio !== undefined, {
    message: 'text or audio is required',
    path: ['text'],
  })

export const CallEndPayload = z.strictObject({
  callId: Base64Url22,
  turn: Revision,
  reason: z.enum(['completed', 'hangup', 'no_answer']),
  by: z.enum(['controller', 'player']),
})

export const ControllerNoticePayload = z.strictObject({
  noticeId: Base64Url22,
  kind: z.enum(['text', 'reseat', 'hotwash.open', 'hotwash.close']).default('text'),
  ref: z.union([Base64Url22, SafeId]).optional(),
  level: z.enum(['info', 'warning', 'urgent']),
  text: Text(1_000),
  targets: TargetList,
  dismissible: z.boolean(),
})

export const ControllerScope = z.strictObject({
  all: z.boolean().optional(),
  rowPrefixes: z.array(SafeId).max(32),
  roleIds: z.array(RoleId).max(64),
})
export type ControllerScope = z.infer<typeof ControllerScope>

export const ControllerRosterPayload = z.strictObject({
  revision: Revision,
  controllers: z
    .array(
      z.strictObject({
        id: SafeId,
        name: Text(120),
        publicKey: Base64UrlBytes(65),
        scope: ControllerScope,
      }),
    )
    .max(32),
})

export const SessionEndPayload = z.strictObject({
  reason: z.enum(['endex', 'cancelled']),
  at: EpochMs,
  message: Text(500).optional(),
})

/** A new root key for one client, wrapped under the pairwise ECDH key. */
export const SessionRekeyPayload = z.strictObject({
  epoch: Int.min(2).max(9999),
  /** Which root the wrapped bytes are: staff clients get the staff root and derive the players key. */
  key: z.enum(['players', 'staff']),
  controllerEcdhPub: Base64UrlBytes(65),
  wrapped: z.strictObject({
    n: Nonce,
    c: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(200),
  }),
})

export const SEALED_PAYLOADS = {
  join: JoinPayload,
  welcome: WelcomePayload,
  'clock.state': ClockStatePayload,
  'inject.release': InjectReleasePayload,
  'inject.receipt': InjectReceiptPayload,
  'inject.recall': InjectRecallPayload,
  'message.send': MessageSendPayload,
  'vote.open': VoteOpenPayload,
  'vote.cast': VoteCastPayload,
  'vote.close': VoteClosePayload,
  'hotwash.item': HotwashItemPayload,
  'hotwash.update': HotwashUpdatePayload,
  'survey.open': SurveyOpenPayload,
  'survey.response': SurveyResponsePayload,
  'survey.close': SurveyClosePayload,
  'eval.assign': EvalAssignPayload,
  'eval.observation': EvalObservationPayload,
  'call.ring': CallRingPayload,
  'call.answer': CallAnswerPayload,
  'call.end': CallEndPayload,
  'controller.notice': ControllerNoticePayload,
  'controller.roster': ControllerRosterPayload,
  'session.end': SessionEndPayload,
  'session.rekey': SessionRekeyPayload,
} as const

export type JoinPayload = z.infer<typeof JoinPayload>
export type WelcomePayload = z.infer<typeof WelcomePayload>
export type InjectReleasePayload = z.infer<typeof InjectReleasePayload>
export type InjectReceiptPayload = z.infer<typeof InjectReceiptPayload>
export type InjectRecallPayload = z.infer<typeof InjectRecallPayload>
export type MessageSendPayload = z.infer<typeof MessageSendPayload>
export type VoteOpenPayload = z.infer<typeof VoteOpenPayload>
export type VoteCastPayload = z.infer<typeof VoteCastPayload>
export type VoteClosePayload = z.infer<typeof VoteClosePayload>
export type HotwashItemPayload = z.infer<typeof HotwashItemPayload>
export type HotwashUpdatePayload = z.infer<typeof HotwashUpdatePayload>
export type SurveyOpenPayload = z.infer<typeof SurveyOpenPayload>
export type SurveyResponsePayload = z.infer<typeof SurveyResponsePayload>
export type SurveyClosePayload = z.infer<typeof SurveyClosePayload>
export type EvalAssignPayload = z.infer<typeof EvalAssignPayload>
export type EvalObservationPayload = z.infer<typeof EvalObservationPayload>
export type CallRingPayload = z.infer<typeof CallRingPayload>
export type CallAnswerPayload = z.infer<typeof CallAnswerPayload>
export type CallEndPayload = z.infer<typeof CallEndPayload>
export type ControllerNoticePayload = z.infer<typeof ControllerNoticePayload>
export type ControllerRosterPayload = z.infer<typeof ControllerRosterPayload>
export type SessionEndPayload = z.infer<typeof SessionEndPayload>
export type SessionRekeyPayload = z.infer<typeof SessionRekeyPayload>
