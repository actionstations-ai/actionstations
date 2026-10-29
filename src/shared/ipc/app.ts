import { z } from 'zod'
import { channel } from './define'
import {
  AppSettings,
  EmbeddingSettings,
  GenerationSettings,
  TipSettings,
  SurveySettings,
  UiSettings,
} from '../schemas/settings'
import { patchOf } from '../schemas/common'
import { ProviderRouting } from '../schemas/provider'
import { SetupMode, ToolId } from '../schemas/setup'

/** A UI settings patch; `tips` merges field by field so turning tips off keeps the position. */
const UiPatch = patchOf(UiSettings).extend({ tips: patchOf(TipSettings).optional() })

const FileFilter = z.object({ name: z.string(), extensions: z.array(z.string()) })

export const appChannels = {
  'app:info': channel(
    z.void(),
    z.object({
      name: z.string(),
      version: z.string(),
      platform: z.string(),
      arch: z.string(),
      electron: z.string(),
      userDataPath: z.string(),
      isPackaged: z.boolean(),
    }),
  ),
  'dialog:open-directory': channel(
    z.object({ title: z.string().optional(), defaultPath: z.string().optional() }),
    z.string().nullable(),
  ),
  'dialog:open-files': channel(
    z.object({
      title: z.string().optional(),
      filters: z.array(FileFilter).optional(),
      multi: z.boolean().default(true),
    }),
    z.array(z.string()),
  ),
  'dialog:save-file': channel(
    z.object({
      title: z.string().optional(),
      defaultPath: z.string().optional(),
      filters: z.array(FileFilter).optional(),
    }),
    z.string().nullable(),
  ),
  /**
   * The renderer's answer to an app:quit-check event: what is still unsaved (#196). Without a
   * requestId it tells main that the renderer's quit guard is listening.
   */
  'app:unsaved-report': channel(
    z.object({ requestId: z.string().optional(), items: z.array(z.string()) }),
    z.void(),
  ),
  /** Project folders the OS asked to open before the window was listening (#277). */
  'app:pending-opens': channel(z.void(), z.array(z.string())),
  /** .aspack files the OS asked to open before the window was listening (#268): review only. */
  'app:pending-pack-opens': channel(z.void(), z.array(z.string())),
  /**
   * Open the guide section a tip links to (#443), in the OS browser. The renderer sends the
   * tip's id; main builds the URL from the bundled tip, so no URL crosses this channel.
   */
  'help:open-guide': channel(z.object({ tipId: z.string().max(64) }), z.void()),
  'shell:show-item': channel(z.object({ path: z.string() }), z.void()),
  'settings:get': channel(z.void(), AppSettings),
  'settings:update': channel(
    z.object({
      ui: UiPatch.optional(),
      embeddings: patchOf(EmbeddingSettings).optional(),
      generation: patchOf(GenerationSettings).optional(),
      surveys: patchOf(SurveySettings).optional(),
      defaultRouting: ProviderRouting.optional(),
      onboardingComplete: z.boolean().optional(),
      defaultProjectsDir: z.string().optional(),
      /** Hide the "re-enter API keys" notice shown after the settings-folder move (#277). */
      keyReentryDismissed: z.boolean().optional(),
      /** How models run and which local tools were skipped (#334). */
      setup: z
        .object({ mode: SetupMode.optional(), skipped: z.array(ToolId).optional() })
        .optional(),
    }),
    AppSettings,
  ),
}
