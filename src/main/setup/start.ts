// Start an installed local tool on the user's click (ADR-0021): LM Studio through `lms server
// start` (or by opening the app), Ollama and ComfyUI by opening their app or `ollama serve`, the
// voice server with mlx_audio.server on 127.0.0.1:8765. Then wait briefly for it to answer.
import type { ToolId } from '@shared/schemas/setup'
import { AppError } from '../lib/errors'
import { TOOLS, VOICE_START_ARGS } from './catalog'
import { findInstalled, lmsPath, probeRunning, type SetupEnv } from './detect'
import { launchDetached, runCommand, type Launcher, type Runner } from './run'

export interface StartDeps {
  env: SetupEnv
  run?: Runner
  launch?: Launcher
  /** How long to wait for the tool to answer (ms). */
  waitMs?: number
  sleep?: (ms: number) => Promise<void>
}

export interface StartResult {
  running: boolean
  baseUrl?: string
  message: string
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function openMacApp(path: string, run: Runner): Promise<void> {
  const res = await run('open', ['-a', path], { timeoutMs: 30_000 })
  if (res.code !== 0) throw new AppError('PROVIDER', `Could not open ${path}: ${res.stderr.trim()}`)
}

async function launch(id: ToolId, deps: StartDeps): Promise<void> {
  const { env } = deps
  const run = deps.run ?? runCommand
  const spawnDetached = deps.launch ?? launchDetached
  const found = findInstalled(id, env)
  if (!found) throw new AppError('NOT_FOUND', `${TOOLS[id].name} is not installed`)
  if (found.kind === 'source')
    throw new AppError(
      'VALIDATION',
      `${TOOLS[id].name} at ${found.path} is a source install; start it the way you usually do.`,
    )
  if (id === 'lmstudio') {
    const lms = lmsPath(env)
    if (lms) {
      const res = await run(lms, ['server', 'start'], { timeoutMs: 60_000 })
      if (res.code !== 0)
        throw new AppError(
          'PROVIDER',
          `lms server start failed: ${(res.stderr || res.stdout).trim().slice(-300)}`,
        )
      return
    }
  }
  if (found.kind === 'app') return openMacApp(found.path, run)
  if (found.kind === 'exe') return spawnDetached(found.path, [])
  if (id === 'voice') return spawnDetached(found.path, VOICE_START_ARGS)
  if (id === 'ollama') return spawnDetached(found.path, ['serve'])
  throw new AppError('VALIDATION', `Start ${TOOLS[id].name} from its app`)
}

/** Start the tool, then poll 127.0.0.1 until it answers or `waitMs` passes. */
export async function startTool(id: ToolId, deps: StartDeps): Promise<StartResult> {
  await launch(id, deps)
  const wait = deps.waitMs ?? 20_000
  const pause = deps.sleep ?? sleep
  const until = Date.now() + wait
  do {
    const running = await probeRunning(deps.env)
    const baseUrl = running.urls[id]
    if (baseUrl) return { running: true, baseUrl, message: `${TOOLS[id].name} is running` }
    await pause(1000)
  } while (Date.now() < until)
  return {
    running: false,
    message: `${TOOLS[id].name} was started but is not answering yet. It may still be loading; detect again in a moment.`,
  }
}
