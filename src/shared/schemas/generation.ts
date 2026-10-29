// Stage output schemas: the JSON each generation stage asks the model to return.
// They are deliberately LLM-friendly (no ULIDs, no nested provenance). The pipeline
// assigns ids and resolves citation keys ("C12" = retrieved chunk #12 shown in the
// prompt) into full Citation objects; a citation key the prompt never showed is
// rejected by the lint pass, so models cannot invent sections.
import { z } from 'zod'
import { CoreCapabilityId } from '../core-capabilities'
import { PurposeTag } from '../taxonomy'
import { GroundingVerifyOutput, PlanConflictOutput } from './grounding'

/** Key of a retrieved chunk as presented in the prompt, e.g. "C3". */
export const CitationKey = z.string().regex(/^C\d+$/)

export const IdeasOutput = z.object({
  ideas: z
    .array(
      z.object({
        title: z.string(),
        hook: z.string(),
        threat: z.string(),
        systemsAffected: z.array(z.string()),
        sectionsExercised: z.array(CitationKey),
        difficulty: z.enum(['introductory', 'intermediate', 'advanced']),
        whyItTeaches: z.string(),
        suggestedRoles: z.array(z.string()),
      }),
    )
    .min(1),
})
export type IdeasOutput = z.infer<typeof IdeasOutput>

export const OverviewOutput = z.object({
  title: z.string(),
  subtitle: z.string(),
  theme: z.string(),
  threat: z.string(),
  operationalImpact: z.string(),
  coreSectionsTested: z.array(z.object({ citation: CitationKey, why: z.string() })).min(1),
  targetAudience: z.string(),
  location: z.string(),
})
export type OverviewOutput = z.infer<typeof OverviewOutput>

export const ObjectivesRolesOutput = z.object({
  objectives: z.array(z.object({ name: z.string(), text: z.string() })).min(1),
  roles: z
    .array(
      z.object({
        key: z.string().describe('short stable key, e.g. "ops", "it", "pio"'),
        name: z.string(),
        abbreviation: z.string(),
        team: z.string(),
        description: z.string(),
        standingOrders: z.array(z.string()),
      }),
    )
    .min(2),
  criticalResources: z.array(z.string()),
})
export type ObjectivesRolesOutput = z.infer<typeof ObjectivesRolesOutput>

export const PhasePlanOutput = z.object({
  phases: z
    .array(
      z.object({
        title: z.string(),
        goal: z.string(),
        startTime: z.string(),
        endTime: z.string(),
        beats: z.array(z.string()).describe('key story beats this phase must hit'),
      }),
    )
    .min(1),
})
export type PhasePlanOutput = z.infer<typeof PhasePlanOutput>

export const MselRowOutput = z.object({
  id: z.string().describe('"I-07", side injects "I-07b", "START", "END"'),
  time: z.string(),
  wallClock: z.string().optional(),
  from: z.string(),
  to: z.array(z.string()).describe('role keys, or ["all"]'),
  event: z.string(),
  expectedAction: z.string(),
  purposeTag: PurposeTag,
  format: z.string().describe('inject type id from the taxonomy'),
  citations: z.array(CitationKey),
})
export type MselRowOutput = z.infer<typeof MselRowOutput>

export const MselPhaseOutput = z.object({ rows: z.array(MselRowOutput).min(1) })
export type MselPhaseOutput = z.infer<typeof MselPhaseOutput>

export const InjectTextOutput = z.object({
  type: z.string(),
  title: z.string(),
  deliveryMode: z.enum(['hand_to_role', 'display_main_screen', 'play_audio', 'read_aloud']),
  /** One of the template's variants (meta.json `variants`); the template default when absent. */
  variant: z.string().optional(),
  fields: z.record(z.string(), z.unknown()),
  instructorNote: z.string().optional(),
  citations: z.array(CitationKey),
})
export type InjectTextOutput = z.infer<typeof InjectTextOutput>

export const MediaBriefOutput = z.object({
  paths: z.array(z.enum(['template', 'ai_image', 'ai_video', 'tts'])),
  imagePrompt: z.string().optional(),
  negativePrompt: z.string().optional(),
  imageStyle: z.enum(['phone', 'press', 'cctv', 'screen', 'portrait']).optional(),
  videoPrompt: z.string().optional(),
  durationSec: z.number().optional(),
  voiceLines: z
    .array(z.object({ speaker: z.string(), voiceStyle: z.string(), text: z.string() }))
    .optional(),
  postFx: z.array(z.enum(['radio', 'phone', 'pa', 'terminal_ambience'])).optional(),
})
export type MediaBriefOutput = z.infer<typeof MediaBriefOutput>

export const HandbookOutput = z.object({
  exerciseOverviewMd: z.string(),
  roomSetupMd: z.string(),
  rulesOfPlayMd: z.string(),
  simcellScripts: z
    .array(
      z.object({
        rolePlayed: z.string(),
        trigger: z.string(),
        hardQuestions: z.array(z.string()),
        concessions: z.array(z.string()),
      }),
    )
    .min(1),
})
export type HandbookOutput = z.infer<typeof HandbookOutput>

export const RubricOutput = z.object({
  metrics: z
    .array(
      z.object({
        name: z.string(),
        points: z.number().int(),
        fail: z.string(),
        pass: z.string(),
        excellence: z.string(),
        linkedInjectIds: z.array(z.string()),
        objectiveRefs: z.array(z.string()),
      }),
    )
    .min(1),
})
export type RubricOutput = z.infer<typeof RubricOutput>

/**
 * The eeg stage (#421): each objective's Core Capabilities, and one Exercise Evaluation Guide
 * per capability whose critical tasks each cite one retrieved plan section. A task without a
 * resolvable citation is dropped by the mapper: the plans, not the model, decide what counts.
 */
export const EegOutput = z.object({
  objectiveCapabilities: z
    .array(
      z.object({
        objective: z.string().describe('exact objective name'),
        capabilities: z
          .array(z.object({ capability: CoreCapabilityId, why: z.string() }))
          .min(1)
          .max(3),
      }),
    )
    .min(1),
  eegs: z
    .array(
      z.object({
        capability: CoreCapabilityId,
        target: z.string(),
        criticalTasks: z
          .array(
            z.object({
              task: z.string(),
              citation: CitationKey,
              expectedBy: z.string().optional().describe('role key'),
              timing: z.string().optional(),
              rowIds: z.array(z.string()),
            }),
          )
          .min(3)
          .max(8),
      }),
    )
    .min(1),
})
export type EegOutput = z.infer<typeof EegOutput>

export const BriefingOutput = z.object({
  currentTime: z.string(),
  weather: z.string(),
  situationBriefMd: z.string(),
  statusBoard: z.array(z.object({ item: z.string(), status: z.string() })),
  anomalyMd: z.string(),
  missionMd: z.string(),
  teams: z.array(
    z.object({
      team: z.string(),
      roleKeys: z.array(z.string()),
      responsibility: z.string(),
      standingOrders: z.array(z.string()),
    }),
  ),
  rulesOfEngagement: z.array(z.string()),
})
export type BriefingOutput = z.infer<typeof BriefingOutput>

export const HotwashOutput = z.object({
  method: z.string(),
  methodDescription: z.string(),
  questions: z
    .array(z.object({ topic: z.string(), text: z.string(), objectiveRef: z.string().optional() }))
    .min(1),
})
export type HotwashOutput = z.infer<typeof HotwashOutput>

export const SitManOutput = z.object({
  assumptions: z.array(z.string()).min(3),
  artificialities: z.array(z.string()).min(2),
  modules: z
    .array(
      z.object({
        phase: z.number().int().describe('1-based phase number'),
        narrativeMd: z.string(),
        keyIssues: z.array(z.string()).min(2).max(6),
        discussionQuestions: z
          .array(
            z.object({
              text: z.string(),
              roleKeys: z.array(z.string()),
              objectiveRef: z.string().optional(),
              citations: z.array(CitationKey),
            }),
          )
          .min(3)
          .max(6),
      }),
    )
    .min(1),
})
export type SitManOutput = z.infer<typeof SitManOutput>

export const CritiqueOutput = z.object({
  issues: z.array(
    z.object({
      severity: z.enum(['info', 'warning', 'error']),
      rowId: z.string().optional(),
      message: z.string(),
      suggestion: z.string(),
    }),
  ),
  summary: z.string(),
})
export type CritiqueOutput = z.infer<typeof CritiqueOutput>

/** Registry so prompt frontmatter `outputSchema: MselPhaseOutput` resolves to a schema. */
export const STAGE_OUTPUT_SCHEMAS = {
  IdeasOutput,
  OverviewOutput,
  ObjectivesRolesOutput,
  PhasePlanOutput,
  MselPhaseOutput,
  InjectTextOutput,
  MediaBriefOutput,
  HandbookOutput,
  RubricOutput,
  EegOutput,
  BriefingOutput,
  HotwashOutput,
  SitManOutput,
  CritiqueOutput,
  GroundingVerifyOutput,
  PlanConflictOutput,
} as const
export type StageOutputSchemaName = keyof typeof STAGE_OUTPUT_SCHEMAS
