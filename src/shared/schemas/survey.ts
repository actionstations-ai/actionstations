// Surveys (#422, spec 0422): participant feedback, knowledge checks, confidence
// self-assessments and debriefs. A survey is stored as scenarios/<id>/surveys/<surveyId>.json;
// its responses as <surveyId>.responses.jsonl beside it. Responses are anonymous by
// construction: the schema has no field for a name, device, address or user agent.
import { z } from 'zod'
import { Citation, Id, IsoDateTime } from './common'

/** FEMA Core Capability id ("operational_communications"); a free id until #421 lands its list. */
export const SurveyCapabilityId = z.string().regex(/^[a-z][a-z0-9_]{0,79}$/)

const questionBase = {
  id: Id,
  text: z.string().min(1).max(1000),
  help: z.string().max(1000).default(''),
  required: z.boolean().default(false),
}

export const RatingQuestion = z.object({
  ...questionBase,
  type: z.literal('rating'),
  min: z.literal(1).default(1),
  max: z.literal(5).default(5),
  lowLabel: z.string().max(80).default('Strongly disagree'),
  highLabel: z.string().max(80).default('Strongly agree'),
  /** One label per point, 1..5 (the HSEEP form labels every point). */
  pointLabels: z.array(z.string().max(80)).length(5).optional(),
})

export const ChoiceOption = z.object({ id: Id, text: z.string().min(1).max(500) })
export type ChoiceOption = z.infer<typeof ChoiceOption>

export const ChoiceQuestion = z
  .object({
    ...questionBase,
    type: z.literal('choice'),
    multiple: z.boolean().default(false),
    options: z.array(ChoiceOption).min(2).max(12),
    /** Knowledge check: the one correct option. Never printed on a player form, never sent. */
    correctOptionId: Id.optional(),
    allowOther: z.boolean().default(false),
    citation: Citation.optional(),
  })
  .refine((q) => !q.correctOptionId || q.options.some((o) => o.id === q.correctOptionId), {
    message: 'The correct answer must be one of the options',
    path: ['correctOptionId'],
  })

export const TextQuestion = z.object({
  ...questionBase,
  type: z.literal('text'),
  long: z.boolean().default(true),
  maxLength: z.number().int().min(1).max(4000).default(2000),
})

export const ConfidenceQuestion = z.object({
  ...questionBase,
  type: z.literal('confidence'),
  /** The first-person statement rated ("I could lead the switch to manual boarding …"). */
  statement: z.string().max(1000).default(''),
  /** Compares the before and after editions; aggregated, never matched per respondent. */
  pairKey: z.string().min(1).max(128),
  edition: z.enum(['before', 'after']),
  objectiveRef: z.string().max(128).optional(),
  capability: SurveyCapabilityId.optional(),
  citation: Citation.optional(),
})

export const SurveyQuestion = z.discriminatedUnion('type', [
  RatingQuestion,
  ChoiceQuestion,
  TextQuestion,
  ConfidenceQuestion,
])
export type SurveyQuestion = z.infer<typeof SurveyQuestion>
export type SurveyQuestionType = SurveyQuestion['type']
export const SURVEY_QUESTION_TYPES = ['rating', 'choice', 'text', 'confidence'] as const

export const SurveySection = z.object({
  id: Id,
  title: z.string().max(200).default(''),
  introMd: z.string().max(4000).default(''),
  questions: z.array(SurveyQuestion).max(60).default([]),
})
export type SurveySection = z.infer<typeof SurveySection>

export const SURVEY_KINDS = [
  'participant_feedback',
  'knowledge_check',
  'confidence',
  'facilitator_debrief',
  'evaluator_debrief',
  'custom',
] as const
export const SurveyKind = z.enum(SURVEY_KINDS)
export type SurveyKind = z.infer<typeof SurveyKind>

/** Kinds filled in by exercise staff: never printed into players/, never offered to players. */
export const STAFF_SURVEY_KINDS: readonly SurveyKind[] = [
  'facilitator_debrief',
  'evaluator_debrief',
]
export const isStaffSurvey = (kind: SurveyKind): boolean => STAFF_SURVEY_KINDS.includes(kind)

export const SurveyTiming = z.enum(['pre', 'post', 'during', 'any'])
export const SurveyEdition = z.enum(['before', 'after'])
export type SurveyEdition = z.infer<typeof SurveyEdition>

/** survey.json format; missing means 1. */
export const SURVEY_FORMAT_VERSION = 1

/** Loose like Scenario: unknown keys written by a newer build survive a save. */
export const Survey = z.looseObject({
  formatVersion: z
    .number()
    .int()
    .default(SURVEY_FORMAT_VERSION)
    .refine((v) => v <= SURVEY_FORMAT_VERSION, {
      message: 'This survey was saved by a newer version of Action Stations. Update the app.',
    }),
  id: Id,
  title: z.string().min(1).max(200),
  kind: SurveyKind.default('custom'),
  timing: SurveyTiming.default('post'),
  /** Knowledge check and confidence surveys come in a before and an after edition. */
  edition: SurveyEdition.optional(),
  /** The other edition's survey id. */
  pairId: Id.optional(),
  introMd: z.string().max(4000).default(''),
  /** Ask for an optional, self-selected team ("role group"); off by default. */
  askRoleGroup: z.boolean().default(false),
  /** Choices offered for the role group: the scenario's teams, never single roles. */
  roleGroups: z.array(z.string().min(1).max(60)).max(20).default([]),
  sections: z.array(SurveySection).max(20).default([]),
  templateId: z.string().max(80).optional(),
  templateVersion: z.number().int().optional(),
  status: z.enum(['draft', 'ready', 'archived']).default('draft'),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
})
export type Survey = z.infer<typeof Survey>

/** rating / confidence: 1..5; choice: option ids; text: the text. */
export const SurveyAnswer = z.union([
  z.number().int().min(1).max(5),
  z.array(Id).max(12),
  z.string().max(4000),
])
export type SurveyAnswer = z.infer<typeof SurveyAnswer>

export const SURVEY_CHANNELS = ['live', 'qr', 'paper', 'manual'] as const
export const SurveyChannel = z.enum(SURVEY_CHANNELS)
export type SurveyChannel = z.infer<typeof SurveyChannel>

/** One anonymous response. Strict: an identity field sent by any caller is refused. */
export const SurveyResponse = z.strictObject({
  id: Id,
  surveyId: Id,
  /** Live play: the per-opening delivery id the session used (spec 0406 `surveyId`). */
  deliveryId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  channel: SurveyChannel,
  /** Rounded down to the minute before it is stored. */
  at: IsoDateTime,
  roleGroup: z.string().max(60).optional(),
  answers: z.record(Id, SurveyAnswer),
  otherText: z.record(Id, z.string().max(500)).default({}),
})
export type SurveyResponse = z.infer<typeof SurveyResponse>

/** Answers typed in by the facilitator (paper forms) or sent by a player page. */
export const SurveyResponseInput = SurveyResponse.pick({
  answers: true,
  otherText: true,
  roleGroup: true,
}).extend({ channel: z.enum(['paper', 'manual']).default('paper') })
export type SurveyResponseInput = z.input<typeof SurveyResponseInput>

const SummaryChoice = z.object({
  optionId: Id,
  text: z.string(),
  count: z.number().int(),
  correct: z.boolean().optional(),
})

export const SurveyQuestionSummary = z.object({
  questionId: Id,
  text: z.string(),
  type: z.string(),
  /** How many responses answered this question. */
  n: z.number().int(),
  mean: z.number().optional(),
  median: z.number().optional(),
  /** Counts for 1..5. */
  distribution: z.array(z.number().int()).optional(),
  choices: z.array(SummaryChoice).optional(),
  /** "Other" texts for a choice question, shuffled like free text. */
  otherTexts: z.array(z.string()).optional(),
  /** Knowledge check: share of answers that picked the correct option, 0..1. */
  shareCorrect: z.number().optional(),
  citation: Citation.optional(),
  /** Free text, shuffled (stable per survey, never chronological). */
  texts: z.array(z.string()).optional(),
  /** Too few answers to show detail for this question. */
  suppressed: z.boolean().default(false),
})
export type SurveyQuestionSummary = z.infer<typeof SurveyQuestionSummary>

export const SurveyPairSummary = z.object({
  pairKey: z.string(),
  statement: z.string(),
  objectiveRef: z.string().optional(),
  capability: z.string().optional(),
  before: z.number().optional(),
  after: z.number().optional(),
  delta: z.number().optional(),
  nBefore: z.number().int(),
  nAfter: z.number().int(),
})
export type SurveyPairSummary = z.infer<typeof SurveyPairSummary>

/** Knowledge check, one item: share correct before and after the exercise. */
export const SurveyKnowledgeItem = z.object({
  questionId: Id,
  text: z.string(),
  shareBefore: z.number().optional(),
  shareAfter: z.number().optional(),
  nBefore: z.number().int(),
  nAfter: z.number().int(),
  citation: Citation.optional(),
})
export type SurveyKnowledgeItem = z.infer<typeof SurveyKnowledgeItem>

export const SurveySummary = z.object({
  surveyId: Id,
  title: z.string(),
  kind: SurveyKind,
  edition: SurveyEdition.optional(),
  responses: z.number().int(),
  byChannel: z.record(z.string(), z.number().int()),
  /** Responses per self-selected role group, when the survey asks for one. */
  byRoleGroup: z.record(z.string(), z.number().int()).default({}),
  minResponses: z.number().int(),
  questions: z.array(SurveyQuestionSummary),
  pairs: z.array(SurveyPairSummary).default([]),
  knowledge: z.array(SurveyKnowledgeItem).default([]),
  /** responses < minResponses: per-question detail hidden. */
  suppressed: z.boolean(),
})
export type SurveySummary = z.infer<typeof SurveySummary>

/** Template metadata for the "New survey" picker. */
export const SurveyTemplateInfo = z.object({
  id: z.string(),
  version: z.number().int(),
  title: z.string(),
  description: z.string(),
  kind: SurveyKind,
  /** The template of the other edition, created together with this one. */
  pairTemplateId: z.string().optional(),
  /** Listed in the picker (the after edition of a pair is created with its before edition). */
  listed: z.boolean(),
})
export type SurveyTemplateInfo = z.infer<typeof SurveyTemplateInfo>

/** A template file in surveys/templates/: a Survey without ids or timestamps. */
export const SurveyTemplate = z.object({
  templateId: z.string().regex(/^[a-z][a-z0-9-]{0,79}$/),
  templateVersion: z.number().int().positive(),
  description: z.string(),
  pairTemplateId: z.string().optional(),
  listed: z.boolean().default(true),
  /** Add one confidence statement per scenario objective when the survey is created. */
  statementsFromObjectives: z.boolean().default(false),
  survey: z.object({
    title: z.string().min(1),
    kind: SurveyKind,
    timing: SurveyTiming,
    edition: SurveyEdition.optional(),
    introMd: z.string().default(''),
    askRoleGroup: z.boolean().default(false),
    sections: z.array(
      z.object({
        id: Id,
        title: z.string().default(''),
        introMd: z.string().default(''),
        questions: z.array(z.record(z.string(), z.unknown())).default([]),
      }),
    ),
  }),
})
export type SurveyTemplate = z.infer<typeof SurveyTemplate>
