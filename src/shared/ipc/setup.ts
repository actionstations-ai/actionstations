// Local tools setup (ADR-0021, #334). Nothing here downloads on its own: install and
// pull-model start a job only when the renderer calls them from a click.
import { z } from 'zod'
import { channel } from './define'
import { SafeId } from '../schemas/common'
import { SetupStatus, ToolId } from '../schemas/setup'

export const SetupInstallResult = z.object({
  tool: ToolId,
  installedAt: z.string().optional(),
  installerOpened: z.boolean().optional(),
  signer: z.string(),
  sha256: z.string(),
  sha256Checked: z.boolean(),
})
export type SetupInstallResult = z.infer<typeof SetupInstallResult>

export const setupChannels = {
  /** Detect tools (files + 127.0.0.1 only), read hardware, list recommended models. */
  'setup:status': channel(z.void(), SetupStatus),
  /** Download, verify and install one tool as a `tool-install` job. */
  'setup:install': channel(z.object({ tool: ToolId }), z.object({ jobId: SafeId })),
  /** Start an installed tool and wait briefly for it to answer. */
  'setup:start': channel(
    z.object({ tool: ToolId }),
    z.object({ running: z.boolean(), baseUrl: z.string().optional(), message: z.string() }),
  ),
  /** Open the vendor's download page in the browser (the app never fetches it). */
  'setup:open-page': channel(z.object({ tool: ToolId }), z.void()),
  /** Pull one recommended model through its tool as a `model-pull` job. */
  'setup:pull-model': channel(
    z.object({ modelId: z.string().min(1).max(200) }),
    z.object({ jobId: SafeId }),
  ),
}
