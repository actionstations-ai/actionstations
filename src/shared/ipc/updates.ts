// Opt-in update check (#442). Nothing here installs anything: the app tells the user that a newer
// release exists and opens its page on GitHub. `updates:open` takes a target name, never a URL.
import { z } from 'zod'
import { channel } from './define'
import { IsoDateTime } from '../schemas/common'
import { UpdateCheckMode, UpdateCheckResult } from '../schemas/settings'

export const UpdateStatus = z.object({
  /** The running app's version. */
  installed: z.string(),
  mode: UpdateCheckMode,
  /** How many launches have shown the question card (FR-3); the card stops after three. */
  askedCount: z.number().int(),
  lastCheckedAt: IsoDateTime.optional(),
  lastResult: UpdateCheckResult.optional(),
  /** A check is running now. */
  checking: z.boolean(),
  /** The last result is a release newer than the installed version. */
  newer: z.boolean(),
  /** The installed version is newer than the latest release (a dev build or prerelease). */
  ahead: z.boolean(),
  /** The user chose "Not now" for this newer version. */
  dismissed: z.boolean(),
  /** Upgrade caveats for this installed version, platform and target release. */
  notes: z.array(z.string()),
  /** The installer for this platform in the latest release, and its checksum file if listed. */
  platformAsset: z.object({ name: z.string(), checksum: z.string().optional() }).optional(),
})
export type UpdateStatus = z.infer<typeof UpdateStatus>

export const updateChannels = {
  'updates:status': channel(z.void(), UpdateStatus),
  /** Check now: one request to the GitHub releases API, started by the user. */
  'updates:check': channel(z.void(), UpdateStatus),
  'updates:set': channel(
    z.strictObject({
      check: z.enum(['on', 'off']).optional(),
      dismissedVersion: z.string().max(64).optional(),
      /** The question card was shown on this launch (counts toward three). */
      asked: z.literal(true).optional(),
    }),
    UpdateStatus,
  ),
  /** Open the stored release page or the Updates guide section in the OS browser. */
  'updates:open': channel(z.object({ target: z.enum(['release', 'guide']) }), z.void()),
}
