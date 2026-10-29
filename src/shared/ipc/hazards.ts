// hazards:* (spec 0439, ADR-0061): optional public hazard data for the organization's area.
// Nothing is fetched unless the user turned the feature on and pressed Fetch. The renderer never
// sends a URL: main builds every request from the project's location and fixed hosts.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { HazardIndex, HazardSnapshot, HazardSourceId } from '../schemas/hazards'

const P = z.object({ projectPath: z.string().min(1) })

export const HazardFetchOptions = z.object({
  firmsDays: z.number().int().min(1).max(5).default(3),
  recentRadiusKm: z.number().min(10).max(500).default(250),
  recentMinMagnitude: z.number().min(0).max(9).default(2.5),
  historicalRadiusKm: z.number().min(10).max(500).default(150),
  historicalMinMagnitude: z.number().min(0).max(9).default(4.5),
})
export type HazardFetchOptions = z.infer<typeof HazardFetchOptions>

export const HazardAppSettings = z.object({
  enabled: z.boolean(),
  hasFirmsKey: z.boolean(),
  encryptionAvailable: z.boolean(),
})
export type HazardAppSettings = z.infer<typeof HazardAppSettings>

export const HazardPlanItem = z.object({
  id: HazardSourceId,
  label: z.string(),
  host: z.string(),
  sends: z.string(),
  returns: z.string(),
  available: z.boolean(),
  reason: z.string().optional(),
})
export type HazardPlanItem = z.infer<typeof HazardPlanItem>

export const HazardPlan = z.object({
  enabled: z.boolean(),
  hasLocation: z.boolean(),
  items: z.array(HazardPlanItem),
})
export type HazardPlan = z.infer<typeof HazardPlan>

export const CountyMatch = z.object({
  label: z.string(),
  stateFips: z.string(),
  countyFips: z.string(),
  lat: z.number(),
  lon: z.number(),
})
export type CountyMatch = z.infer<typeof CountyMatch>

export const hazardChannels = {
  'hazards:settings': channel(z.void(), HazardAppSettings),
  'hazards:settings-save': channel(z.object({ enabled: z.boolean() }), HazardAppSettings),
  /** Save the FIRMS map key in the OS keychain (refused when none is available). */
  'hazards:firms-key-set': channel(
    z.object({ key: z.string().trim().min(1).max(200) }),
    HazardAppSettings,
  ),
  'hazards:firms-key-remove': channel(z.void(), HazardAppSettings),
  /** Open the FIRMS map key sign-up page in the browser (main knows the address). */
  'hazards:firms-signup-open': channel(z.void(), z.void()),
  'hazards:gazetteer-search': channel(
    z.object({ query: z.string().max(100) }),
    z.array(CountyMatch).max(20),
  ),
  /** What each source would send and to which host. No network call. */
  'hazards:plan': channel(
    P.extend({ options: HazardFetchOptions.default(HazardFetchOptions.parse({})) }),
    HazardPlan,
  ),
  /** Fetch the chosen sources now and save a snapshot. Refused with FORBIDDEN when off. */
  'hazards:fetch': channel(
    P.extend({
      sources: z.array(HazardSourceId).min(1).max(6),
      options: HazardFetchOptions.default(HazardFetchOptions.parse({})),
    }),
    HazardSnapshot,
  ),
  /** Read a GeoJSON or CSV layer file (chosen with dialog:open-files) on this computer. */
  'hazards:import-layer': channel(
    P.extend({
      file: z.string().min(1),
      layer: z.string().trim().min(1).max(80),
      source: z.string().trim().min(1).max(200),
      radiusKm: z.number().min(1).max(500).default(50),
    }),
    HazardSnapshot,
  ),
  'hazards:list': channel(P, HazardIndex),
  'hazards:get': channel(P.extend({ id: SafeId }), HazardSnapshot),
  'hazards:update': channel(
    P.extend({
      id: SafeId,
      label: z.string().max(80).optional(),
      pinned: z.boolean().optional(),
      active: z.boolean().optional(),
    }),
    HazardIndex,
  ),
  'hazards:delete': channel(P.extend({ id: SafeId }), HazardIndex),
}
