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

/**
 * Who holds which seat. The controller sends players roles and names only: a client id is
 * never shown to every device (#411), so `client` is set only in welcomes to staff.
 */
const RosterEntry = z.strictObject({
  client: ClientId.optional(),
  name: Text(60),
  roleId: RoleId.optional(),
  kind: ClientKind,
})

/**
 * A seat a device may ask for (#411). The controller sends the list in a `welcome` without a
 * `role` (the lobby) so the join screen can show names, teams and capacities; the server never
 * sees it. Evaluator and observer seats use the reserved role ids.
 */
export const Seat = z.strictObject({
  id: RoleId,
  name: Text(80),
  abbreviation: Text(12).optional(),
  teamId: SafeId.optional(),
  teamName: Text(80).optional(),
  kind: ClientKind,
  /** Absent: unlimited. */
  capacity: z.number().int().min(0).max(500).optional(),
  taken: z.number().int().min(0).max(500),
})
export type Seat = z.infer<typeof Seat>

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
  /** The seats a device may choose; sent with a lobby welcome (no `role`) and on reseat. */
  seats: z.array(Seat).max(200).optional(),
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

/**
 * A micro-drill on devices (spec 0437 FR-17). The open frame carries the situation and the
 * questions only: expected points, hints and model answers stay on the controller and reach a
 * device one at a time in `drill.feedback`. The frame is host-only.
 */
export const DrillOpenPayload = z.strictObject({
  drillId: Base64Url22,
  title: Text(120),
  situation: Text(1_500),
  durationMin: Int.min(1).max(60),
  /** `checklist`: no model checks answers; the device ticks the points it covered. */
  assessment: z.enum(['model', 'checklist']),
  steps: z
    .array(z.strictObject({ id: SafeId, prompt: Text(1_200) }))
    .min(1)
    .max(5),
  targets: TargetList,
})

/** `check` sends an answer (and, in a checklist drill, the ticked points); `hint` asks for the next hint. */
export const DrillAnswerPayload = z.strictObject({
  drillId: Base64Url22,
  stepId: SafeId,
  ask: z.enum(['check', 'hint']),
  text: Text(4_000).optional(),
  ticked: z.array(SafeId).max(6).optional(),
})

const HintLevel = z.union([z.literal(1), z.literal(2), z.literal(3)])

/** The controller's reply to one device (`client:<id>`): what the answer covered, a hint, or the points to tick. */
export const DrillFeedbackPayload = z.strictObject({
  drillId: Base64Url22,
  stepId: SafeId,
  kind: z.enum(['result', 'hint', 'checklist', 'error']),
  covered: z.array(Text(300)).max(6).optional(),
  /** Points not fully covered yet. */
  left: Count.max(6).optional(),
  followUp: Text(400).optional(),
  /** The hint level on offer after a result, when the hint rule allows one. */
  hintOffer: HintLevel.optional(),
  hint: z
    .strictObject({
      level: HintLevel,
      text: Text(600),
      /** Where in the plan: heading path and page. */
      where: Text(600).optional(),
      quote: Text(600).optional(),
    })
    .optional(),
  points: z
    .array(z.strictObject({ id: SafeId, text: Text(300) }))
    .max(6)
    .optional(),
  modelAnswer: Text(1_200).optional(),
  message: Text(300).optional(),
})

export const DrillClosePayload = z.strictObject({ drillId: Base64Url22 })

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

/** What a co-controller may do, by family of frame. Nothing else is allowed (#517). */
export const CO_CONTROLLER_PERMISSIONS = [
  'inject',
  'message',
  'vote',
  'survey',
  'call',
  'notice',
] as const
export type CoControllerPermission = (typeof CO_CONTROLLER_PERMISSIONS)[number]
/** Permissions a roster entry without `permissions` has: release and recall its own rows. */
export const DEFAULT_CO_PERMISSIONS: readonly CoControllerPermission[] = ['inject']

export const ControllerScope = z.strictObject({
  all: z.boolean().optional(),
  rowPrefixes: z.array(SafeId).max(32),
  roleIds: z.array(RoleId).max(64),
  /** Explicit grants, least privilege: absent means `DEFAULT_CO_PERMISSIONS`. */
  permissions: z.array(z.enum(CO_CONTROLLER_PERMISSIONS)).max(6).optional(),
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

/**
 * The host tells a co-controller how a device took one of the releases that co-controller signed
 * (#517). Receipts are sealed to the host alone, so the host forwards the status, by role and
 * never by device, sealed with the staff key to that co-controller's connection.
 */
export const PartnerReceiptPayload = z.strictObject({
  releaseId: Base64Url22,
  mselRowId: SafeId,
  roleId: RoleId.optional(),
  status: z.enum(['delivered', 'read', 'actioned']),
  at: EpochMs,
})

/**
 * A reply drafted for the SimCell helper device to approve, edit or discard (#518). Staff key,
 * to one `client:<id>` seat. A higher `revision` replaces the draft; `withdrawn` removes it
 * (the controller handled it first).
 */
export const SimcellDraftPayload = z.strictObject({
  draftId: Base64Url22,
  revision: Revision,
  status: z.enum(['queued', 'withdrawn']).default('queued'),
  persona: Text(120),
  threadLabel: Text(120),
  playerMessage: Text(4_000).optional(),
  text: Text(4_000),
  flags: z.array(z.strictObject({ code: SafeId, message: Text(200) })).max(10),
})

/** The helper's decision on a draft, sealed to the controller (#518). */
export const SimcellActionPayload = z
  .strictObject({
    draftId: Base64Url22,
    revision: Revision,
    action: z.enum(['approve', 'edit', 'discard']),
    text: Text(4_000).optional(),
  })
  .refine((a) => a.action !== 'edit' || (a.text !== undefined && a.text.trim() !== ''), {
    message: 'an edit needs the new text',
    path: ['text'],
  })
  .refine((a) => a.action === 'edit' || a.text === undefined, {
    message: 'only an edit carries text',
    path: ['text'],
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
  'drill.open': DrillOpenPayload,
  'drill.answer': DrillAnswerPayload,
  'drill.feedback': DrillFeedbackPayload,
  'drill.close': DrillClosePayload,
  'eval.assign': EvalAssignPayload,
  'eval.observation': EvalObservationPayload,
  'call.ring': CallRingPayload,
  'call.answer': CallAnswerPayload,
  'call.end': CallEndPayload,
  'controller.notice': ControllerNoticePayload,
  'controller.roster': ControllerRosterPayload,
  'partner.receipt': PartnerReceiptPayload,
  'simcell.draft': SimcellDraftPayload,
  'simcell.action': SimcellActionPayload,
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
export type DrillOpenPayload = z.infer<typeof DrillOpenPayload>
export type DrillAnswerPayload = z.infer<typeof DrillAnswerPayload>
export type DrillFeedbackPayload = z.infer<typeof DrillFeedbackPayload>
export type DrillClosePayload = z.infer<typeof DrillClosePayload>
export type EvalAssignPayload = z.infer<typeof EvalAssignPayload>
export type EvalObservationPayload = z.infer<typeof EvalObservationPayload>
export type CallRingPayload = z.infer<typeof CallRingPayload>
export type CallAnswerPayload = z.infer<typeof CallAnswerPayload>
export type CallEndPayload = z.infer<typeof CallEndPayload>
export type ControllerNoticePayload = z.infer<typeof ControllerNoticePayload>
export type ControllerRosterPayload = z.infer<typeof ControllerRosterPayload>
export type PartnerReceiptPayload = z.infer<typeof PartnerReceiptPayload>
export type SimcellDraftPayload = z.infer<typeof SimcellDraftPayload>
export type SimcellActionPayload = z.infer<typeof SimcellActionPayload>
export type SessionEndPayload = z.infer<typeof SessionEndPayload>
export type SessionRekeyPayload = z.infer<typeof SessionRekeyPayload>
