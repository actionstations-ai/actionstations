// Local tools setup (ADR-0021, #334): how the user runs models, and what each local tool
// looks like on this machine. Persisted part: SetupSettings (settings.json). The rest are
// views main computes on request.
import { z } from 'zod'

/** The local tools setup knows about. */
export const ToolId = z.enum(['lmstudio', 'ollama', 'comfyui', 'voice'])
export type ToolId = z.infer<typeof ToolId>

/** Cloud APIs only, local tools, or both. Unset until the user chooses. */
export const SetupMode = z.enum(['cloud', 'local', 'mix'])
export type SetupMode = z.infer<typeof SetupMode>

export const SetupSettings = z.object({
  mode: SetupMode.optional(),
  /** Tools the user chose to skip; shown collapsed, can be undone. */
  skipped: z.array(ToolId).default([]),
})
export type SetupSettings = z.infer<typeof SetupSettings>

/** Detected = installed and answering on 127.0.0.1; installed = found on disk, not answering. */
export const ToolState = z.enum(['running', 'installed', 'missing'])
export type ToolState = z.infer<typeof ToolState>

/** How this platform can get the tool: one-click verified install, a guided command, or the page. */
export const InstallMethod = z.enum(['install', 'guided', 'page', 'unsupported'])
export type InstallMethod = z.infer<typeof InstallMethod>

export const ToolView = z.object({
  id: ToolId,
  name: z.string(),
  purpose: z.string(),
  license: z.string(),
  licenseUrl: z.string(),
  downloadPage: z.string(),
  /** "571 MB download · about 700 MB on disk" for this platform. */
  sizeLabel: z.string(),
  state: ToolState,
  /** Where it answered when running (for adding it as a provider). */
  baseUrl: z.string().optional(),
  /** What was found on disk (app bundle or CLI path), for the installed state. */
  foundAt: z.string().optional(),
  method: InstallMethod,
  /** Why the method is page / unsupported / guided on this platform. */
  methodNote: z.string().optional(),
  /** For guided installs: the command the user runs themselves. */
  command: z.string().optional(),
  /** Start is offered (installed, not running, and the tool can be started). */
  canStart: z.boolean(),
  /** What verification a one-click install does here, in words. */
  verification: z.string().optional(),
})
export type ToolView = z.infer<typeof ToolView>

export const HardwareView = z.object({
  platform: z.string(),
  arch: z.string(),
  appleSilicon: z.boolean(),
  ramBytes: z.number(),
  vramBytes: z.number().optional(),
  gpuName: z.string().optional(),
  /** Memory a local model may use, by the ADR-0021 rule. */
  budgetBytes: z.number(),
  /** False when models would run on the CPU only. */
  gpu: z.boolean(),
})
export type HardwareView = z.infer<typeof HardwareView>

export const ModelRole = z.enum(['text', 'embedding', 'image', 'video'])
export type ModelRole = z.infer<typeof ModelRole>

export const RecommendedModel = z.object({
  /** Stable id the renderer sends back to pull it; main looks it up, never trusts a name. */
  id: z.string(),
  tool: ToolId,
  role: ModelRole,
  name: z.string(),
  sizeBytes: z.number(),
  /** The size is approximate (LM Studio picks the variant). */
  approximate: z.boolean().default(false),
  license: z.string(),
  note: z.string().optional(),
  installed: z.boolean(),
  /** The tool must be running to pull (Ollama API, ComfyUI folders). */
  needsRunning: z.boolean(),
})
export type RecommendedModel = z.infer<typeof RecommendedModel>

export const SetupStatus = z.object({
  hardware: HardwareView,
  tools: z.array(ToolView),
  models: z.array(RecommendedModel),
})
export type SetupStatus = z.infer<typeof SetupStatus>
