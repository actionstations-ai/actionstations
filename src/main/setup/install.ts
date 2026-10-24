// One-click install of a local tool (ADR-0021): download from the vendor's pinned location,
// check the sha256 when the vendor publishes one, verify the publisher signature, then do the
// vendor's documented install. macOS: copy the verified .app out of the read-only DMG into
// Applications. Windows: open the verified installer like a double-click (Windows shows UAC
// if it needs admin rights). Never silent, never elevated by the app.
import { constants, promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { ToolId } from '@shared/schemas/setup'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import { TOOLS, platformKey, type InstallerSource, type ToolDef } from './catalog'
import type { SetupEnv } from './detect'
import { downloadFile, setupGetJson, type HostPolicy } from './fetch'
import { runCommand, type Runner } from './run'
import { verifyMacApp, verifyWindowsInstaller } from './verify'

export interface InstallContext {
  signal: AbortSignal
  progress: (fraction: number, message: string) => void
  log: (message: string) => void
}

export interface InstallDeps {
  env: SetupEnv
  /** Download folder (userData/setup/downloads). */
  dir: string
  run?: Runner
  /** electron shell.openPath: '' on success, else an error message. */
  openPath: (path: string) => Promise<string>
  /** Tests only: replaces the tool's host allowlist (a local fixture server). */
  policy?: HostPolicy
  /** Tests only: the system Applications folder (default /Applications). */
  applicationsDir?: string
  /** Tests only: replaces the catalog's start URL (a local fixture server). */
  urlOverride?: string
}

export interface InstallResult {
  tool: ToolId
  /** macOS: where the verified app was copied. */
  installedAt?: string
  /** Windows: the vendor installer was opened and is now running on its own. */
  installerOpened?: boolean
  signer: string
  sha256: string
  sha256Checked: boolean
}

interface Resolved {
  url: string
  sha256?: string
}

const MB = 1024 * 1024

/** The asset URL and sha256 digest from a GitHub "latest release" listing. */
export function githubAsset(release: unknown, name: string): Resolved {
  const assets = (release as { assets?: unknown })?.assets
  const asset = Array.isArray(assets)
    ? (assets as { name?: unknown; browser_download_url?: unknown; digest?: unknown }[]).find(
        (a) => a?.name === name,
      )
    : undefined
  if (!asset || typeof asset.browser_download_url !== 'string')
    throw new AppError(
      'PROVIDER',
      `The vendor's latest release has no ${name}; use "Open the download page".`,
    )
  const digest =
    typeof asset.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(asset.digest) : null
  return {
    url: asset.browser_download_url,
    ...(digest?.[1] ? { sha256: digest[1].toLowerCase() } : {}),
  }
}

async function resolveSource(
  source: InstallerSource,
  policy: HostPolicy,
  signal: AbortSignal,
  fetchImpl: typeof fetch,
): Promise<Resolved> {
  if (!source.githubAsset) return { url: source.url }
  const release = await setupGetJson(source.url, policy, { signal, fetchImpl })
  return githubAsset(release, source.githubAsset.name)
}

function sourceFor(
  def: ToolDef,
  env: SetupEnv,
): InstallerSource & { identity: NonNullable<ToolDef['identity']> } {
  const source = def.sources[platformKey(env.platform, env.arch)]
  if (!source || !def.identity)
    throw new AppError(
      'VALIDATION',
      `${def.name} has no one-click install on this computer; use "Open the download page".`,
    )
  return { ...source, identity: def.identity }
}

/** Remove earlier downloads of this tool (a Windows installer is kept until the next try). */
async function clearOld(dir: string, id: ToolId): Promise<void> {
  const names = await fs.readdir(dir).catch(() => [] as string[])
  await Promise.all(
    names.filter((n) => n.startsWith(`${id}-`)).map((n) => fs.rm(join(dir, n), { force: true })),
  )
}

async function writable(dir: string): Promise<boolean> {
  return fs.access(dir, constants.W_OK).then(
    () => true,
    () => false,
  )
}

async function macTarget(
  env: SetupEnv,
  appName: string,
  system = '/Applications',
): Promise<string> {
  const dir = (await writable(system)) ? system : join(env.home, 'Applications')
  await fs.mkdir(dir, { recursive: true })
  const dest = join(dir, appName)
  if (env.exists(dest))
    throw new AppError(
      'CONFLICT',
      `${dest} already exists. Start it from there, or remove it first.`,
    )
  return dest
}

async function installFromDmg(
  def: ToolDef,
  file: string,
  identity: NonNullable<ToolDef['identity']>,
  deps: InstallDeps,
  ctx: InstallContext,
): Promise<{ installedAt: string; signer: string }> {
  const run = deps.run ?? runCommand
  const mount = await fs.mkdtemp(join(deps.dir, 'mnt-'))
  const attached = await run(
    'hdiutil',
    ['attach', '-readonly', '-nobrowse', '-noautoopen', '-mountpoint', mount, file],
    { signal: ctx.signal, timeoutMs: 300_000 },
  )
  if (attached.code !== 0) {
    await fs.rm(mount, { recursive: true, force: true })
    throw new AppError(
      'PROVIDER',
      `Could not open the disk image: ${attached.stderr.trim().slice(0, 200)}`,
    )
  }
  try {
    const entries = await fs.readdir(mount)
    const appName = def.macApps.find((a) => entries.includes(a))
    if (!appName) throw new AppError('PROVIDER', `The disk image has no ${def.macApps[0]}`)
    ctx.progress(0.9, `Verifying ${appName}`)
    const checked = await verifyMacApp(join(mount, appName), identity, run)
    ctx.log(`Verified ${appName}: team ${checked.teamId}, accepted by Gatekeeper`)
    const dest = await macTarget(deps.env, appName, deps.applicationsDir)
    ctx.progress(0.95, `Copying ${appName} to ${dest}`)
    const copied = await run('ditto', [join(mount, appName), dest], {
      signal: ctx.signal,
      timeoutMs: 600_000,
    })
    if (copied.code !== 0)
      throw new AppError(
        'PROVIDER',
        `Could not copy the app: ${copied.stderr.trim().slice(0, 200)}`,
      )
    try {
      await verifyMacApp(dest, identity, run)
    } catch (err) {
      await fs.rm(dest, { recursive: true, force: true })
      throw err
    }
    return { installedAt: dest, signer: checked.authority ?? identity.macTeamName }
  } finally {
    await run('hdiutil', ['detach', mount, '-force'], { timeoutMs: 60_000 }).catch(() => undefined)
    await fs.rm(mount, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Download, check and install one tool. Runs inside a job; throws to fail it. */
export async function installTool(
  id: ToolId,
  ctx: InstallContext,
  deps: InstallDeps,
): Promise<InstallResult> {
  const def = TOOLS[id]
  const { env } = deps
  const source = sourceFor(def, env)
  if (source.format === 'dmg' && env.platform !== 'darwin')
    throw new AppError('VALIDATION', 'Disk images install on macOS only')
  if (source.format === 'exe' && env.platform !== 'win32')
    throw new AppError('VALIDATION', 'Windows installers run on Windows only')
  const policy = deps.policy ?? { hosts: def.hosts }
  await fs.mkdir(deps.dir, { recursive: true })
  await clearOld(deps.dir, id)

  ctx.progress(0, `Finding the latest ${def.name}`)
  const start = deps.urlOverride ? { ...source, url: deps.urlOverride } : source
  const resolved = await resolveSource(start, policy, ctx.signal, env.fetchImpl)
  if (source.githubAsset && !resolved.sha256)
    ctx.log(`${def.name}: the release lists no sha256 for this file; relying on the signature`)
  const file = join(deps.dir, `${id}-${newId()}.${source.format}`)
  ctx.log(`Downloading ${def.name} from ${new URL(resolved.url).host}`)
  const got = await downloadFile(
    {
      url: resolved.url,
      policy,
      maxBytes: source.maxBytes,
      ...(resolved.sha256 ? { expectedSha256: resolved.sha256 } : {}),
      dest: file,
    },
    {
      signal: ctx.signal,
      fetchImpl: env.fetchImpl,
      onProgress: ({ receivedBytes, totalBytes }) =>
        ctx.progress(
          totalBytes ? 0.85 * (receivedBytes / totalBytes) : 0,
          `Downloaded ${Math.round(receivedBytes / MB)}${totalBytes ? ` of ${Math.round(totalBytes / MB)}` : ''} MB`,
        ),
    },
  )
  ctx.log(`Downloaded ${Math.round(got.size / MB)} MB, sha256 ${got.sha256}`)
  const base = { tool: id, sha256: got.sha256, sha256Checked: Boolean(resolved.sha256) }
  if (source.format === 'dmg') {
    try {
      const done = await installFromDmg(def, got.path, source.identity, deps, ctx)
      return { ...base, installedAt: done.installedAt, signer: done.signer }
    } finally {
      await fs.rm(got.path, { force: true })
    }
  }
  ctx.progress(0.9, 'Verifying the installer signature')
  try {
    const sig = await verifyWindowsInstaller(got.path, source.identity, deps.run ?? runCommand)
    ctx.log(`Verified the installer: ${sig.subject}`)
  } catch (err) {
    await fs.rm(got.path, { force: true })
    throw err
  }
  ctx.progress(0.95, `Opening the ${def.name} installer`)
  const error = await deps.openPath(got.path)
  if (error) throw new AppError('PROVIDER', `Could not open the installer: ${error}`)
  return { ...base, installerOpened: true, signer: source.identity.winSubjectCn }
}
