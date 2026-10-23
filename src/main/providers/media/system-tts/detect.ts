// Find an installed speech engine by looking for its executable on PATH. No command is run,
// so detection is cheap enough for "Detect local services" and provider health checks.
import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { ENGINES, enginesFor, type Engine, type EngineId } from './engines'

export interface DetectEnv {
  platform: NodeJS.Platform
  env: NodeJS.ProcessEnv
  /** Whether an executable exists at this absolute path. */
  isExecutable: (path: string) => boolean
}

export interface FoundEngine {
  engine: Engine
  /** Absolute path of the executable. */
  path: string
}

const defaultIsExecutable = (path: string): boolean => {
  try {
    accessSync(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch {
    return false
  }
}

export const systemDetectEnv = (): DetectEnv => ({
  platform: process.platform,
  env: process.env,
  isExecutable: defaultIsExecutable,
})

function candidates(engine: Engine, d: DetectEnv): string[] {
  const pathVar = d.env.PATH ?? d.env.Path ?? ''
  const dirs = pathVar.split(d.platform === 'win32' ? ';' : delimiter).filter(Boolean)
  const names =
    d.platform === 'win32' && !engine.command.endsWith('.exe')
      ? [`${engine.command}.exe`]
      : [engine.command]
  const found = dirs.flatMap((dir) => names.map((n) => join(dir, n)))
  if (engine.id === 'sapi') {
    const root = d.env.SystemRoot ?? d.env.windir ?? 'C:\\Windows'
    found.push(join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'))
  }
  if (engine.id === 'say') found.push('/usr/bin/say')
  return found
}

function locate(engine: Engine, d: DetectEnv): string | undefined {
  return candidates(engine, d).find((p) => d.isExecutable(p))
}

/**
 * The engine to use: the preferred one when installed and valid for this platform, else the
 * first installed engine for the platform. Undefined when the machine has no system voice.
 */
export function findEngine(
  d: DetectEnv = systemDetectEnv(),
  preferred?: EngineId,
): FoundEngine | undefined {
  const order = enginesFor(d.platform)
  const pick = preferred ? ENGINES[preferred] : undefined
  const list = pick && order.includes(pick) ? [pick, ...order.filter((e) => e !== pick)] : order
  for (const engine of list) {
    const path = locate(engine, d)
    if (path) return { engine, path }
  }
  return undefined
}
