// Example projects (#169). Each example ships as `examples/<slug>/` with an `example.json`
// manifest and a `project/` folder (a normal project as the app writes it). Opening one
// copies `project/` to a new folder and opens the copy; the original is never modified.
import { z } from 'zod'
import { channel } from './define'
import { OpenProject } from '../schemas/project'
import { SafeId } from '../schemas/common'
import { isDomainId } from '../domains'
import { ThreatFamilyId } from '../domains/schema'
import { PackCopyState } from '../schemas/project-packs'

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
  /**
   * A registered domain profile id: a built-in one or one of an enabled pack (#263). A pack's
   * reader checks its own examples with `exampleManifestFor(packDomainIds)` instead.
   */
  domainProfile: z.string().refine((v) => isDomainId(v), { message: 'Unknown domain profile id' }),
  /** One to three sentences for the gallery card. */
  summary: z.string().min(1).max(1000),
  /** Examples are fictional organizations; the app says so wherever one is shown. */
  fictional: z.literal(true),
  /** Banner text shown inside every project opened from this example. */
  notice: z.string().min(1).max(1000),
  scenarios: z.array(ExampleScenario).default([]),
})
export type ExampleManifest = z.infer<typeof ExampleManifest>

/**
 * ExampleManifest for a pack being read before it is registered: `domainProfile` may also be
 * one of `packDomainIds` (the pack's own domains, ADR-0018).
 */
export const exampleManifestFor = (packDomainIds: readonly string[]) =>
  ExampleManifest.extend({
    domainProfile: z.string().refine((v) => isDomainId(v) || packDomainIds.includes(v), {
      message: 'Unknown domain profile id',
    }),
  })

/**
 * A listed example: its manifest plus the folder name it is opened by. Pack examples (#266)
 * also carry the pack they come from; `slug` is unique per source (`packId` or built-in), so a
 * built-in and a pack example may share a slug.
 */
export const ExampleInfo = ExampleManifest.extend({
  slug: SafeId,
  /** Set for an example of an installed, enabled pack; absent for a built-in one. */
  packId: z.string().min(1).optional(),
  packVersion: z.string().min(1).optional(),
  packName: z.string().min(1).optional(),
  /** The pack's SPDX license expression (pack.json `license`). */
  packLicense: z.string().min(1).optional(),
})
export type ExampleInfo = z.infer<typeof ExampleInfo>

/** What a project opened from an example remembers (its `.example.json` marker file). */
export const ExampleMarker = z.object({
  slug: SafeId,
  title: z.string(),
  notice: z.string(),
  domainProfile: z.string(),
  /** The pack the example was copied from (#266); absent for a built-in example. */
  packId: z.string().min(1).optional(),
  packVersion: z.string().min(1).optional(),
  packName: z.string().min(1).optional(),
})
export type ExampleMarker = z.infer<typeof ExampleMarker>

/**
 * The marker as examples:marker answers it: a pack example also says whether its pack is still
 * installed and whether the installed pack has a newer version (#269 badges). An example copy
 * is meant to be changed, so there is no "edited" state.
 */
export const ExampleMarkerView = ExampleMarker.extend({
  packState: PackCopyState.omit({ edited: true }).optional(),
})
export type ExampleMarkerView = z.infer<typeof ExampleMarkerView>

export const exampleChannels = {
  /**
   * Examples shipped with the app plus those of enabled packs (#266), ordered by title.
   * Invalid manifests are skipped and logged.
   */
  'examples:list': channel(z.void(), z.array(ExampleInfo)),
  /**
   * Copy an example's project into `parentDir` (default: the projects folder from Settings,
   * else ~/Documents/Action Stations) under a name no existing folder has, then open it.
   */
  'examples:open': channel(
    z.object({
      slug: SafeId,
      /** Open the example of this enabled pack instead of the built-in one with that slug. */
      packId: z.string().min(1).optional(),
      parentDir: z.string().min(1).optional(),
    }),
    OpenProject,
  ),
  /** The example a project was opened from, or null for an ordinary project. */
  'examples:marker': channel(
    z.object({ projectPath: z.string().min(1) }),
    ExampleMarkerView.nullable(),
  ),
}
