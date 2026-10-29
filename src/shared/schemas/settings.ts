import { z } from 'zod'
import { HttpUrl, IsoDateTime } from './common'
import { Fingerprint } from './live'
import { CapabilityResult } from './persona'
import { ProgramSettings } from './program'
import { RecentProject } from './project'
import { PrivacySettings, ProjectPrivacy } from './privacy'
import { ProviderConfig, ProviderRouting } from './provider'
import { SetupSettings } from './setup'

export const EmbeddingSettings = z.object({
  mode: z.enum(['local-onnx', 'hash', 'provider']).default('hash'),
  /** For local-onnx: HF model id. For provider: model name on that provider. */
  model: z.string().default('Xenova/bge-small-en-v1.5'),
  providerId: z.string().optional(),
})
export type EmbeddingSettings = z.infer<typeof EmbeddingSettings>

/** Tip of the day on the Projects screen (#443). */
export const TipSettings = z.object({
  enabled: z.boolean().default(true),
  /** Index into the tips this version shows of the next tip; wraps when out of range. */
  nextIndex: z.number().int().min(0).max(10_000).default(0),
})
export type TipSettings = z.infer<typeof TipSettings>

const defaultTips = (): TipSettings => ({ enabled: true, nextIndex: 0 })

export const UiSettings = z.object({
  theme: z.enum(['system', 'light', 'dark']).default('system'),
  tips: TipSettings.default(defaultTips),
})
export type UiSettings = z.infer<typeof UiSettings>

/** What happens after a scenario finishes generating (#227). */
export const GenerationSettings = z.object({
  /** Start "Write all injects", then "Render all media", when a generation job finishes. */
  autoInjectsAndMedia: z.boolean().default(false),
})
export type GenerationSettings = z.infer<typeof GenerationSettings>

/**
 * API keys that could not be read after the settings folder moved to its new name (#277).
 * The Providers page lists them until the user dismisses the notice; entering a key for a
 * provider removes it from the list.
 */
export const KeyReentry = z.object({
  providerIds: z.array(z.string()).default([]),
  dismissed: z.boolean().default(false),
})
export type KeyReentry = z.infer<typeof KeyReentry>

/**
 * A pack catalog the user added (ADR-0018). None by default: the app fetches a catalog only
 * when the user opens Browse or presses Refresh. The url is checked against PackFetchUrl when
 * it is added; here it stays a plain string so one odd entry cannot reset all settings.
 */
export const PackCatalogSource = z.object({
  url: z.string().min(1).max(2048),
  /** The catalog's own name, from the last successful fetch. */
  name: z.string().max(100).optional(),
  addedAt: IsoDateTime,
  lastFetchedAt: IsoDateTime.optional(),
  /** Why the last refresh failed; cleared by a successful one. */
  lastError: z.string().max(1000).optional(),
})
export type PackCatalogSource = z.infer<typeof PackCatalogSource>

export const PackSettings = z.object({
  catalogs: z.array(PackCatalogSource).max(50).default([]),
})
export type PackSettings = z.infer<typeof PackSettings>

/** Opt-in update check (#442). `ask` sends nothing, exactly like `off`. */
export const UpdateCheckMode = z.enum(['ask', 'on', 'off'])
export type UpdateCheckMode = z.infer<typeof UpdateCheckMode>

/** The newest published release, as the app stores it after a check. */
export const LatestRelease = z.object({
  /** The tag without its leading "v"; a semantic version. */
  version: z.string().max(64),
  name: z.string().max(200),
  publishedAt: IsoDateTime,
  /** The release page (html_url), re-checked by isReleasePageUrl before it is opened. */
  url: z.string().max(2048),
  /** The release notes, Markdown, shown as text only. */
  notes: z.string().max(50_000),
  assets: z
    .array(z.object({ name: z.string().max(200), size: z.number().int().nonnegative() }))
    .max(50),
})
export type LatestRelease = z.infer<typeof LatestRelease>

export const UpdateCheckResult = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ok'), latest: LatestRelease }),
  z.object({
    kind: z.literal('error'),
    message: z.string().max(500),
    /** When GitHub's rate limit resets, for "try again after HH:MM". */
    retryAfter: IsoDateTime.optional(),
  }),
])
export type UpdateCheckResult = z.infer<typeof UpdateCheckResult>

export const UpdateSettings = z.object({
  check: UpdateCheckMode.default('ask'),
  /** Launches that showed the question card on Projects; after three the answer is `off`. */
  askedCount: z.number().int().min(0).max(3).default(0),
  lastCheckedAt: IsoDateTime.optional(),
  lastResult: UpdateCheckResult.optional(),
  /** "Not now" on the banner for this version; a later release shows the banner again. */
  dismissedVersion: z.string().max(64).optional(),
})
export type UpdateSettings = z.infer<typeof UpdateSettings>
/** Survey results (#422). */
export const SurveySettings = z.object({
  /** Fewer responses than this: results show counts only, no per-question detail. */
  minResponses: z.number().int().min(1).max(50).default(3),
})
export type SurveySettings = z.infer<typeof SurveySettings>

/** A self-hosted live play server the facilitator saved (#410). The server key is never here. */
export const LiveServerEntry = z.object({
  url: HttpUrl,
  name: z.string().max(80).optional(),
  fingerprintSha256: Fingerprint.optional(),
  addedAt: IsoDateTime,
  lastTestedAt: IsoDateTime.optional(),
  lastError: z.string().max(500).optional(),
})
export type LiveServerEntry = z.infer<typeof LiveServerEntry>

export const LiveSettings = z.object({
  defaultConnectionKind: z.enum(['lan', 'relay', 'self-hosted']).default('lan'),
  servers: z.array(LiveServerEntry).max(20).default([]),
})
export type LiveSettings = z.infer<typeof LiveSettings>

/** SimCell assistant (#429): the model capability check, cached per provider and model. */
export const SimcellSettings = z.object({
  capability: z.record(z.string().max(300), CapabilityResult).default({}),
})
export type SimcellSettings = z.infer<typeof SimcellSettings>

/** Organization identities for regional exercises (spec 0440). Public values only; keys are in secrets. */
export const RegionalIdentity = z.object({
  orgId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/),
  name: z.string().min(1).max(120),
  prefix: z.string().regex(/^[A-Z]{2,6}$/),
  /** Ed25519 public key (base64 SPKI DER) that signs exercise bundles. */
  publicKey: z.string(),
  fingerprint: z.string(),
  /** P-256 public key (base64url, 65 bytes) used as a co-controller in a live session. */
  liveKey: z.string(),
  createdAt: z.string(),
})
export type RegionalIdentity = z.infer<typeof RegionalIdentity>

export const AppSettings = z.object({
  /** Organization identities on this computer, by orgId (spec 0440). */
  regional: z
    .object({ orgs: z.record(z.string(), RegionalIdentity).default({}) })
    .default({ orgs: {} }),
  recentProjects: z.array(RecentProject).default([]),
  providers: z.array(ProviderConfig).default([]),
  /** Global default routing; a project's providerRouting overrides per task. */
  defaultRouting: ProviderRouting.default({}),
  embeddings: EmbeddingSettings.default({ mode: 'hash', model: 'Xenova/bge-small-en-v1.5' }),
  ui: UiSettings.default(() => ({ theme: 'system' as const, tips: defaultTips() })),
  generation: GenerationSettings.default({ autoInjectsAndMedia: false }),
  onboardingComplete: z.boolean().default(false),
  defaultProjectsDir: z.string().optional(),
  keyReentry: KeyReentry.optional(),
  packs: PackSettings.default({ catalogs: [] }),
  /** Cloud APIs only, local tools or a mix, and skipped tools (ADR-0021, #334). */
  setup: SetupSettings.default({ skipped: [] }),
  /** Opt-in check for a newer release (#442); asks first, never on by default. */
  updates: UpdateSettings.default(() => ({ check: 'ask' as const, askedCount: 0 })),
  surveys: SurveySettings.default({ minResponses: 3 }),
  /** What goes to cloud providers: review policy and redaction defaults (#433). */
  privacy: PrivacySettings.default(() => PrivacySettings.parse({})),
  /**
   * Per-project privacy choices made on this computer, by project id (#433). They may relax the
   * defaults; a project file's own `privacy` may only make them stricter.
   */
  projectPrivacy: z.record(z.string().max(128), ProjectPrivacy).default({}),
  /** The active exercise program folder and the ones opened before (#424). */
  program: ProgramSettings.default(() => ({ recent: [] })),
  /** Live play connection defaults and remembered servers (#410). */
  live: LiveSettings.default(() => ({ defaultConnectionKind: 'lan' as const, servers: [] })),
  simcell: SimcellSettings.default({ capability: {} }),
})
export type AppSettings = z.infer<typeof AppSettings>
