// Three states per local tool (ADR-0021): running (answers on 127.0.0.1), installed (found on
// disk, not answering) or missing. Builds on the "Detect local services" probes; only reads
// files and talks to 127.0.0.1.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, win32 } from 'node:path'
import type { ToolId, ToolState, ToolView } from '@shared/schemas/setup'
import { detectLocalServices, type LocalService } from '../providers/local-detect'
import {
  TOOLS,
  TOOL_ORDER,
  VOICE_INSTALL_COMMAND,
  VOICE_PORT,
  VOICE_SIZE_LABEL,
  platformKey,
  type ToolDef,
} from './catalog'

export interface SetupEnv {
  platform: NodeJS.Platform
  arch: string
  home: string
  /** %LOCALAPPDATA% on Windows. */
  localAppData?: string
  exists: (path: string) => boolean
  fetchImpl: typeof fetch
}

export function defaultEnv(): SetupEnv {
  return {
    platform: process.platform,
    arch: process.arch,
    home: homedir(),
    ...(process.env.LOCALAPPDATA ? { localAppData: process.env.LOCALAPPDATA } : {}),
    exists: existsSync,
    fetchImpl: fetch,
  }
}

/** Where a tool was found on disk, and how it can be started. */
export interface Found {
  path: string
  /** app = macOS bundle; exe = Windows program; cli = command-line binary; source = a git checkout (not startable). */
  kind: 'app' | 'exe' | 'cli' | 'source'
}

const winJoin = (...p: string[]) => win32.join(...p)

/** Found install locations per tool and platform, most specific first. */
export function candidates(id: ToolId, env: SetupEnv): Found[] {
  const { platform, home } = env
  const macApps = (names: string[]): Found[] =>
    names.flatMap((n) => [
      { path: join('/Applications', n), kind: 'app' as const },
      { path: join(home, 'Applications', n), kind: 'app' as const },
    ])
  const local = env.localAppData ?? winJoin(home, 'AppData', 'Local')
  const def = TOOLS[id]
  switch (id) {
    case 'lmstudio': {
      const lms =
        platform === 'win32'
          ? { path: winJoin(home, '.lmstudio', 'bin', 'lms.exe'), kind: 'cli' as const }
          : { path: join(home, '.lmstudio', 'bin', 'lms'), kind: 'cli' as const }
      if (platform === 'darwin') return [...macApps(def.macApps), lms]
      if (platform === 'win32')
        return [
          { path: winJoin(local, 'Programs', 'LM Studio', 'LM Studio.exe'), kind: 'exe' },
          lms,
        ]
      return [lms]
    }
    case 'ollama':
      if (platform === 'darwin')
        return [
          ...macApps(def.macApps),
          { path: '/opt/homebrew/bin/ollama', kind: 'cli' },
          { path: '/usr/local/bin/ollama', kind: 'cli' },
        ]
      if (platform === 'win32')
        return [{ path: winJoin(local, 'Programs', 'Ollama', 'ollama.exe'), kind: 'cli' }]
      return [
        { path: '/usr/local/bin/ollama', kind: 'cli' },
        { path: '/usr/bin/ollama', kind: 'cli' },
      ]
    case 'comfyui': {
      // A git checkout of ComfyUI counts as installed; the app cannot start it for the user.
      const source = { path: join(home, 'ComfyUI', 'main.py'), kind: 'source' as const }
      if (platform === 'darwin') return [...macApps(def.macApps), source]
      if (platform === 'win32')
        return [
          // electron-builder per-user install folders; the product folder name has varied.
          {
            path: winJoin(local, 'Programs', '@comfyorgcomfyui-electron', 'ComfyUI.exe'),
            kind: 'exe',
          },
          { path: winJoin(local, 'Programs', 'ComfyUI', 'ComfyUI.exe'), kind: 'exe' },
          source,
        ]
      return [source]
    }
    case 'voice':
      return [
        { path: join(home, '.local', 'bin', 'mlx_audio.server'), kind: 'cli' },
        { path: '/opt/homebrew/bin/mlx_audio.server', kind: 'cli' },
        { path: '/usr/local/bin/mlx_audio.server', kind: 'cli' },
      ]
  }
}

export function findInstalled(id: ToolId, env: SetupEnv): Found | undefined {
  return candidates(id, env).find((c) => env.exists(c.path))
}

/** The lms CLI, which appears after LM Studio's first launch. */
export function lmsPath(env: SetupEnv): string | undefined {
  const p =
    env.platform === 'win32'
      ? winJoin(env.home, '.lmstudio', 'bin', 'lms.exe')
      : join(env.home, '.lmstudio', 'bin', 'lms')
  return env.exists(p) ? p : undefined
}

async function answers(url: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(800) })
    await res.body?.cancel().catch(() => undefined)
    return res.ok
  } catch {
    return false
  }
}

export interface Running {
  services: LocalService[]
  /** Base URL each tool answered on. */
  urls: Partial<Record<ToolId, string>>
}

/** Probe the tools on 127.0.0.1: the shared local probes (ComfyUI on 8188 or 8000) and the voice server. */
export async function probeRunning(env: SetupEnv): Promise<Running> {
  const [services, voice] = await Promise.all([
    detectLocalServices(env.fetchImpl),
    answers(`http://127.0.0.1:${VOICE_PORT}/v1/models`, env.fetchImpl),
  ])
  const up = (label: string) => services.find((s) => s.label === label && s.reachable)
  const urls: Partial<Record<ToolId, string>> = {}
  const lm = up('LM Studio')
  if (lm) urls.lmstudio = lm.baseUrl
  const ol = up('Ollama')
  if (ol) urls.ollama = ol.baseUrl
  const comfy = up('ComfyUI')
  // The shared probe tries 8188, then ComfyUI Desktop's 8000.
  if (comfy) urls.comfyui = comfy.baseUrl
  if (voice) urls.voice = `http://127.0.0.1:${VOICE_PORT}/v1`
  return { services, urls }
}

function methodFor(def: ToolDef, env: SetupEnv): Pick<ToolView, 'method' | 'methodNote'> {
  const key = platformKey(env.platform, env.arch)
  const unsupported = def.unsupported?.(key)
  if (unsupported) return { method: 'unsupported', methodNote: unsupported }
  if (def.id === 'voice')
    return {
      method: 'guided',
      methodNote:
        'mlx-audio is a Python package with no signed installer, so Action Stations does not install it. Run the command below in Terminal (it needs uv from astral.sh), then detect again.',
    }
  if (def.sources[key]) return { method: 'install' }
  const note = def.pageReason[env.platform]
  return { method: 'page', ...(note ? { methodNote: note } : {}) }
}

function verificationText(def: ToolDef, env: SetupEnv): string | undefined {
  const source = def.sources[platformKey(env.platform, env.arch)]
  if (!source || !def.identity) return undefined
  const who =
    env.platform === 'darwin'
      ? `${def.identity.macTeamName} (Team ID ${def.identity.macTeamId}), notarized by Apple`
      : `${def.identity.winSubjectCn} (Authenticode)`
  return source.githubAsset
    ? `Checks the sha256 the vendor publishes and the publisher signature: ${who}.`
    : `Checks the publisher signature: ${who}. The vendor publishes no checksum.`
}

export function sizeLabel(def: ToolDef, env: SetupEnv): string {
  if (def.id === 'voice') return VOICE_SIZE_LABEL
  return (
    def.sources[platformKey(env.platform, env.arch)]?.sizeLabel ?? 'Size: see the download page'
  )
}

function canStart(id: ToolId, found: Found | undefined, env: SetupEnv): boolean {
  if (!found || found.kind === 'source') return false
  if (id === 'lmstudio') return Boolean(lmsPath(env)) || found.kind !== 'cli'
  return true
}

export function toolView(id: ToolId, env: SetupEnv, running: Running): ToolView {
  const def = TOOLS[id]
  const found = findInstalled(id, env)
  const url = running.urls[id]
  const state: ToolState = url ? 'running' : found ? 'installed' : 'missing'
  const verification = verificationText(def, env)
  return {
    id,
    name: def.name,
    purpose: def.purpose,
    license: def.license,
    licenseUrl: def.licenseUrl,
    downloadPage: def.downloadPage,
    sizeLabel: sizeLabel(def, env),
    state,
    ...(url ? { baseUrl: url } : {}),
    ...(found ? { foundAt: found.path } : {}),
    ...methodFor(def, env),
    ...(id === 'voice' ? { command: VOICE_INSTALL_COMMAND } : {}),
    canStart: state === 'installed' && canStart(id, found, env),
    ...(verification ? { verification } : {}),
  }
}

/** Every tool's view, in display order. */
export async function detectTools(
  env: SetupEnv = defaultEnv(),
): Promise<{ tools: ToolView[]; running: Running }> {
  const running = await probeRunning(env)
  return { tools: TOOL_ORDER.map((id) => toolView(id, env, running)), running }
}
