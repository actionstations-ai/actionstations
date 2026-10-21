import { z } from 'zod'
import { channel } from './define'
import { AppSettings, EmbeddingSettings, UiSettings } from '../schemas/settings'
import { patchOf } from '../schemas/common'
import { ProviderRouting } from '../schemas/provider'

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
  'shell:show-item': channel(z.object({ path: z.string() }), z.void()),
  'settings:get': channel(z.void(), AppSettings),
  'settings:update': channel(
    z.object({
      ui: patchOf(UiSettings).optional(),
      embeddings: patchOf(EmbeddingSettings).optional(),
      defaultRouting: ProviderRouting.optional(),
      onboardingComplete: z.boolean().optional(),
      defaultProjectsDir: z.string().optional(),
    }),
    AppSettings,
  ),
}
