// Example projects (#169). Each example ships as `examples/<slug>/` with an `example.json`
// manifest and a `project/` folder (a normal project as the app writes it). Opening one
// copies `project/` to a new folder and opens the copy; the original is never modified.
import { z } from 'zod'
import { channel } from './define'
import { OpenProject } from '../schemas/project'
import { SafeId } from '../schemas/common'
import { DOMAIN_IDS } from '../domains'
import { ThreatFamilyId } from '../domains/schema'

export const ExampleScenario = z.object({
  id: SafeId,
  title: z.string().min(1),
  threatFamily: ThreatFamilyId,
  summary: z.string().default(''),
})
export type ExampleScenario = z.infer<typeof ExampleScenario>

/** `examples/<slug>/example.json`: the contract shared by #169, #157 and #158. */
export const ExampleManifest = z.object({
  id: SafeId,
  title: z.string().min(1).max(200),
  /** A built-in domain profile id (src/shared/domains). */
  domainProfile: z
    .string()
    .refine((v) => DOMAIN_IDS.includes(v), { message: 'Unknown domain profile id' }),
  /** One to three sentences for the gallery card. */
  summary: z.string().min(1).max(1000),
  /** Examples are fictional organizations; the app says so wherever one is shown. */
  fictional: z.literal(true),
  /** Banner text shown inside every project opened from this example. */
  notice: z.string().min(1).max(1000),
  scenarios: z.array(ExampleScenario).default([]),
})
export type ExampleManifest = z.infer<typeof ExampleManifest>

/** A listed example: its manifest plus the folder name it is opened by. */
export const ExampleInfo = ExampleManifest.extend({ slug: SafeId })
export type ExampleInfo = z.infer<typeof ExampleInfo>

/** What a project opened from an example remembers (its `.example.json` marker file). */
export const ExampleMarker = z.object({
  slug: SafeId,
  title: z.string(),
  notice: z.string(),
  domainProfile: z.string(),
})
export type ExampleMarker = z.infer<typeof ExampleMarker>

export const exampleChannels = {
  /** Examples shipped with the app (invalid manifests are skipped and logged). */
  'examples:list': channel(z.void(), z.array(ExampleInfo)),
  /**
   * Copy an example's project into `parentDir` (default: the projects folder from Settings,
   * else ~/Documents/Tabletop Generator) under a name no existing folder has, then open it.
   */
  'examples:open': channel(
    z.object({ slug: SafeId, parentDir: z.string().min(1).optional() }),
    OpenProject,
  ),
  /** The example a project was opened from, or null for an ordinary project. */
  'examples:marker': channel(
    z.object({ projectPath: z.string().min(1) }),
    ExampleMarker.nullable(),
  ),
}
