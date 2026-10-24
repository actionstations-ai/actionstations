// Local tools setup (ADR-0021, #334): status, one-click install as a job, start, the vendor
// download page, and recommended model pulls. Downloads start only from these channels,
// which the renderer calls from a button.
import { shell } from 'electron'
import type { ToolId } from '@shared/schemas/setup'
import type { SetupInstallResult } from '@shared/ipc/setup'
import { defineHandlers } from '../registry'
import { jobs } from '../../jobs/manager'
import { userDataPath } from '../../lib/paths'
import { setupStatus } from '../../setup'
import { TOOLS } from '../../setup/catalog'
import { defaultEnv, lmsPath, probeRunning, type SetupEnv } from '../../setup/detect'
import type { HardwareInput } from '../../setup/hardware'
import { installTool } from '../../setup/install'
import { modelDef, pullModel } from '../../setup/models'
import type { HostPolicy } from '../../setup/fetch'
import type { Launcher, Runner } from '../../setup/run'
import { startTool } from '../../setup/start'

/** Stand-ins for the OS and the network; tests replace them, production leaves them unset. */
export const setupDeps: {
  env?: () => SetupEnv
  run?: Runner
  launch?: Launcher
  openPath?: (p: string) => Promise<string>
  hardware?: () => Promise<HardwareInput>
  policy?: HostPolicy
  startWaitMs?: number
} = {}

const env = (): SetupEnv => setupDeps.env?.() ?? defaultEnv()

function activeJob(kind: 'tool-install' | 'model-pull', key: string): string | undefined {
  return jobs
    .list({ activeOnly: true })
    .find(
      (j) =>
        j.kind === kind &&
        (j.status === 'queued' || j.status === 'running') &&
        (j.payload as { key?: string } | undefined)?.key === key,
    )?.id
}

function startInstall(tool: ToolId): { jobId: string } {
  const key = `tool:${tool}`
  const running = activeJob('tool-install', key)
  if (running) return { jobId: running }
  const job = jobs.start(
    'tool-install',
    async (ctx): Promise<SetupInstallResult> =>
      installTool(
        tool,
        { signal: ctx.signal, progress: (f, m) => ctx.progress(f, m), log: (m) => ctx.log(m) },
        {
          env: env(),
          dir: userDataPath('setup', 'downloads'),
          openPath: setupDeps.openPath ?? ((p) => shell.openPath(p)),
          ...(setupDeps.run ? { run: setupDeps.run } : {}),
          ...(setupDeps.policy ? { policy: setupDeps.policy } : {}),
        },
      ),
    { payload: { key, tool } },
  )
  return { jobId: job.id }
}

function startPull(modelId: string): { jobId: string } {
  const def = modelDef(modelId)
  const key = `model:${def.id}`
  const running = activeJob('model-pull', key)
  if (running) return { jobId: running }
  const job = jobs.start(
    'model-pull',
    async (ctx) => {
      const e = env()
      ctx.progress(0, `Downloading ${def.name}`)
      const lms = lmsPath(e)
      await pullModel(def, {
        signal: ctx.signal,
        progress: (f, m) => ctx.progress(Math.min(1, f), m),
        running: await probeRunning(e),
        fetchImpl: e.fetchImpl,
        ...(lms ? { lms } : {}),
        ...(setupDeps.run ? { run: setupDeps.run } : {}),
        ...(setupDeps.policy ? { policy: setupDeps.policy } : {}),
      })
      ctx.log(`Downloaded ${def.name} into ${TOOLS[def.tool].name}`)
      return { modelId: def.id, tool: def.tool }
    },
    { payload: { key, modelId: def.id, model: def.name } },
  )
  return { jobId: job.id }
}

export default defineHandlers({
  'setup:status': () =>
    setupStatus({
      env: env(),
      ...(setupDeps.hardware ? { hardware: setupDeps.hardware } : {}),
    }),
  'setup:install': ({ tool }) => startInstall(tool),
  'setup:start': ({ tool }) =>
    startTool(tool, {
      env: env(),
      ...(setupDeps.run ? { run: setupDeps.run } : {}),
      ...(setupDeps.launch ? { launch: setupDeps.launch } : {}),
      ...(setupDeps.startWaitMs !== undefined ? { waitMs: setupDeps.startWaitMs } : {}),
    }),
  'setup:open-page': async ({ tool }) => {
    await shell.openExternal(TOOLS[tool].downloadPage)
  },
  'setup:pull-model': ({ modelId }) => startPull(modelId),
})
