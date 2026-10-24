// Domain profiles (ADR-0014): everything that used to be an airport assumption, as data.
// A profile describes one kind of organization (an airport, a transit agency, a dam…): the
// identifier categories its documents state, its typical IT/OT systems, player roles, outside
// parties, media channels, what its places look like in a photo, the inject types that fit
// it and the threat families it can exercise. A threat family carries the phase arc, the
// decision-point and clue vocabulary and the lint rules for one kind of incident.
// Pure data + zod: no Node imports, so the renderer can show profiles too.
import { z } from 'zod'

export const THREAT_FAMILY_IDS = [
  'cyber',
  'physical_security',
  'cyber_physical',
  'uas_drone',
  'insider',
  'natural_hazard',
  'infrastructure_failure',
  'mass_gathering',
] as const
export const ThreatFamilyId = z.enum(THREAT_FAMILY_IDS)
export type ThreatFamilyId = z.infer<typeof ThreatFamilyId>

/**
 * One kind of facility identifier the documents may state (facility.ts extracts and lints
 * them). Either `noun` + `idShape` ("Routes? 14, 22 and 41") or a custom `pattern` whose
 * first capture group is the identifier ("\b([A-Z][a-z]+) Line\b" → "Blue").
 */
export const FactCategory = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** Sheet label shown to the model and in lint messages, e.g. "Routes". */
  label: z.string(),
  /** Regex source (case-insensitive) for the noun(s) before an identifier list, e.g. "Routes?". */
  noun: z.string().optional(),
  /**
   * A broader noun that names this kind only in context (#165): a dam's "Unit 4" is a
   * generating unit in a powerhouse row and a patrol car in a sheriff row. Matched only where
   * `context` matches (the sentence, in documents; the row or inject text, in lint) and never
   * after a responder/vehicle qualifier ("Patrol Unit 4", "Access Gate 2").
   */
  genericNoun: z.string().optional(),
  /** Regex source (case-insensitive) that says a text is about this category ("turbine|MW"). */
  context: z.string().optional(),
  /**
   * alnum: "A1", "14", "B12" with ranges ("A1–A8") and lists; number: digits only;
   * runway: "5/23" pairs plus each end; token: "RTU-07", "PLC-3" (noun glued to a number).
   */
  idShape: z.enum(['alnum', 'number', 'runway', 'token']).default('alnum'),
  /** Custom regex source with the identifier in group 1 (used instead of noun + idShape). */
  pattern: z.string().optional(),
  /** Flag identifiers of this kind in generated text that the documents do not list. */
  lint: z.boolean().default(true),
  /** Show every id to the model ("the complete list") instead of the first 20. */
  complete: z.boolean().default(false),
})
export type FactCategory = z.infer<typeof FactCategory>

export const PhaseArcEntry = z.object({
  title: z.string(),
  goal: z.string(),
  beats: z.array(z.string()),
})
export type PhaseArcEntry = z.infer<typeof PhaseArcEntry>

export const ThreatFamily = z.object({
  id: ThreatFamilyId,
  label: z.string(),
  description: z.string(),
  /** Lower-case words/phrases that identify this family in a brief or idea text. */
  keywords: z.array(z.string()),
  /** The default phase arc (four phases; compressed or extended to the requested count). */
  phaseArc: z.array(PhaseArcEntry).min(1),
  /** High-consequence calls with a cost on both sides, phrased for the MSEL author. */
  decisionPointExamples: z.array(z.string()),
  /** What a CLUE is in this family (phrased for the MSEL author). */
  clueKinds: z.string(),
  /** What a TECH_HURDLE / recovery complication is in this family. */
  hurdleKinds: z.string(),
  /** The outside party players most need to coordinate with (SimCell scripts, decision point). */
  keyCoordination: z.string(),
  lint: z.object({
    /** Every phase needs a CLUE or TECH_HURDLE aimed at the clue role. */
    clueRequired: z.boolean(),
    /** Which role the clues go to: technical (IT/OT), security (LE/security), operations. */
    clueRole: z.enum(['technical', 'security', 'operations']),
    /** The decision point must involve this (regex source), e.g. airspace / law enforcement. */
    decisionMustMention: z.object({ pattern: z.string(), description: z.string() }).optional(),
  }),
})
export type ThreatFamily = z.infer<typeof ThreatFamily>

export const RoleTemplate = z.object({
  key: z.string(),
  name: z.string(),
  abbreviation: z.string(),
  team: z.string(),
  description: z.string(),
})
export type RoleTemplate = z.infer<typeof RoleTemplate>

/** Positive, concrete settings for image prompts (SDXL ignores negation). */
export const SceneAnchors = z.object({
  /** Where the public / customers / passengers are. */
  public: z.string(),
  /** The control room, dispatch floor or operations center. */
  control: z.string(),
  /** Outdoors, the field, the plant yard, the street. */
  exterior: z.string(),
  /**
   * `public` with no screen, board or monitor named (SDXL lights every display it is asked
   * to paint, #141); derived by dropping the screen clauses when absent.
   */
  publicScreensDark: z.string().optional(),
})
export type SceneAnchors = z.infer<typeof SceneAnchors>

/** Words that identify the generic role kinds in a role's key/abbreviation/name (regex sources). */
export const RolePatterns = z.object({
  public: z.string().optional(),
  technical: z.string().optional(),
  security: z.string().optional(),
  operations: z.string().optional(),
})
export type RolePatterns = z.infer<typeof RolePatterns>

export const DomainVocabulary = z.object({
  /** "the terminal", "the system (buses, rail, depots)", "the dam and powerhouse" */
  facility: z.string(),
  /** "passengers", "riders", "downstream residents and visitors", "patients and visitors" */
  public: z.string(),
  /** "gate agents, duty managers, TSA supervisors", "bus operators, dispatchers, mechanics" */
  frontline: z.string(),
  /** "the Airport Operations Center (AOC)", "the Operations Control Center (OCC)" */
  operationsCenter: z.string(),
})
export type DomainVocabulary = z.infer<typeof DomainVocabulary>

export const DomainProfile = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  description: z.string(),
  /** Other orgType values that resolve to this profile ("hospital" → healthcare). */
  aliases: z.array(z.string()).default([]),
  vocabulary: DomainVocabulary,
  factCategories: z.array(FactCategory).default([]),
  systems: z.object({ it: z.array(z.string()), ot: z.array(z.string()) }),
  roles: z.array(RoleTemplate),
  outsideParties: z.array(z.string()),
  mediaChannels: z.array(z.string()),
  sceneAnchors: SceneAnchors,
  /** Inject type ids that fit this domain best (offered first; the taxonomy's domain tags gate the rest). */
  injectTypes: z.array(z.string()),
  /** Threat families this domain can exercise; the first is the default. */
  threatFamilies: z.array(ThreatFamilyId).min(1),
  /** Unrelated distractions typical of the domain (NOISE injects). */
  noiseExamples: z.array(z.string()),
  /** Public / stakeholder pressure typical of the domain (PRESSURE / MISINFORMATION injects). */
  pressureExamples: z.array(z.string()),
  rolePatterns: RolePatterns.default({}),
  /** Extra agencies and regulators (regex source, alternation) that facility.ts extracts. */
  agencyPattern: z.string().optional(),
})
export type DomainProfile = z.infer<typeof DomainProfile>

/**
 * Per-project overrides stored in project.json: every field but id is optional and, when
 * present, replaces the built-in value (arrays replace, they do not merge).
 */
export const DomainProfileOverrides = DomainProfile.omit({ id: true, aliases: true }).partial()
export type DomainProfileOverrides = z.infer<typeof DomainProfileOverrides>

/**
 * A pack domain profile copied into project.json when the project picks it (ADR-0018, #263):
 * the project keeps linting and extracting facts with it after the pack is updated or gone.
 * Updating it from a newer pack version is an explicit action.
 */
export const DomainProfileSnapshot = z.object({
  profile: DomainProfile,
  packId: z.string().min(1),
  /** The pack version the profile was copied from. */
  version: z.string().min(1),
  /** The pack's display name, for "from <pack> (not installed)". */
  packName: z.string().optional(),
})
export type DomainProfileSnapshot = z.infer<typeof DomainProfileSnapshot>
