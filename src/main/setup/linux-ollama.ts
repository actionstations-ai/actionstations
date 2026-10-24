// One-click Ollama on Linux without sudo (#338, ADR-0021). Ollama's documented manual install
// is `curl … | sudo tar x -C /usr`; this does the same unpacking into a per-user folder under
// the XDG data directory instead. The release tarball (and any GPU add-on the user ticked)
// must match the sha256 Ollama publishes in the release's sha256sum.txt, and GitHub's own
// digest of the asset when it lists one. Everything is unpacked into a staging folder and
// moved into place only when every archive passed; a failure leaves nothing behind.
import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { OllamaAddonId } from '@shared/schemas/setup'
import { AppError } from '../lib/errors'
import { newId } from '../lib/ids'
import {
  OLLAMA_LINUX_ADDONS,
  OLLAMA_SUMS_ASSET,
  OLLAMA_TAR_ALLOW,
  OLLAMA_UNPACKED_MAX,
  type InstallerSource,
  type LinuxAddon,
} from './catalog'
import type { SetupEnv } from './detect'
import { downloadFile, setupGetJson, setupGetText, type HostPolicy } from './fetch'
import type { InstallContext } from './install'
import { githubAsset, releaseTag } from './release'
import { extractTarZst } from './untar'

const MB = 1024 * 1024

/** $XDG_DATA_HOME when absolute, else ~/.local/share. */
export const dataHome = (env: SetupEnv): string =>
  env.xdgDataHome && isAbsolute(env.xdgDataHome)
    ? env.xdgDataHome
    : join(env.home, '.local', 'share')

/** Where the app unpacks Ollama for this user. */
export const ollamaUserDir = (env: SetupEnv): string =>
  join(dataHome(env), 'actionstations', 'tools', 'ollama')

export const ollamaUserBin = (env: SetupEnv): string => join(ollamaUserDir(env), 'bin', 'ollama')

/**
 * GPU add-ons this machine can use. ROCm needs the amdgpu kernel driver's compute interface
 * (/dev/kfd), which is what Ollama itself looks for. JetPack follows Ollama's install.sh: the
 * L4T release in /etc/nv_tegra_release. NVIDIA CUDA and Vulkan are in the main tarball.
 */
export function offeredAddons(env: SetupEnv): LinuxAddon[] {
  if (env.platform !== 'linux') return []
  if (env.arch === 'x64') return env.exists('/dev/kfd') ? [OLLAMA_LINUX_ADDONS.rocm] : []
  if (env.arch === 'arm64') {
    const tegra = env.readText?.('/etc/nv_tegra_release') ?? ''
    if (/\bR36\b/.test(tegra)) return [OLLAMA_LINUX_ADDONS.jetpack6]
    if (/\bR35\b/.test(tegra)) return [OLLAMA_LINUX_ADDONS.jetpack5]
  }
  return []
}

/** `<sha256>  ./<name>` lines (sha256sum output) → name → lowercase hex. */
export function parseSha256Sums(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64}) [ *]?(?:\.\/)?([^\s/]+)$/.exec(line.trim())
    if (m) out.set(m[2]!, m[1]!.toLowerCase())
  }
  return out
}

interface Part {
  name: string
  url: string
  sha256: string
  maxBytes: number
}

/** Each archive's URL and the sha256 both sources agree on; refuses anything unverifiable. */
export function verifiedParts(
  release: unknown,
  sums: Map<string, string>,
  wanted: { name: string; maxBytes: number }[],
): Part[] {
  return wanted.map(({ name, maxBytes }) => {
    const asset = githubAsset(release, name)
    const published = sums.get(name)
    if (!published)
      throw new AppError(
        'VALIDATION',
        `Ollama's ${OLLAMA_SUMS_ASSET} lists no checksum for ${name}, so it cannot be verified. Nothing was downloaded; use "Open the download page".`,
      )
    if (asset.sha256 && asset.sha256 !== published)
      throw new AppError(
        'VALIDATION',
        `The checksum for ${name} in ${OLLAMA_SUMS_ASSET} differs from GitHub's digest of the file. Nothing was downloaded.`,
      )
    return { name, url: asset.url, sha256: published, maxBytes }
  })
}

export interface LinuxInstallDeps {
  env: SetupEnv
  /** Download folder (userData/setup/downloads). */
  dir: string
  policy: HostPolicy
  /** Tests only: the release listing URL (a local fixture server). */
  urlOverride?: string
}

export interface LinuxInstallResult {
  installedAt: string
  sha256: string
  addons: OllamaAddonId[]
}

function checkAddons(env: SetupEnv, addons: OllamaAddonId[]): LinuxAddon[] {
  const offered = offeredAddons(env)
  return [...new Set(addons)].map((id) => {
    const a = offered.find((o) => o.id === id)
    if (!a)
      throw new AppError(
        'VALIDATION',
        `${OLLAMA_LINUX_ADDONS[id].name} is not offered on this computer: the hardware it needs was not found.`,
      )
    return a
  })
}

/** Download each part, adding each finished file to `files` (so the caller can remove them). */
async function download(
  parts: Part[],
  files: string[],
  deps: LinuxInstallDeps,
  ctx: InstallContext,
): Promise<void> {
  for (const [i, part] of parts.entries()) {
    const dest = join(deps.dir, `ollama-${newId()}.tar.zst`)
    ctx.log(`Downloading ${part.name} from ${new URL(part.url).host}`)
    const got = await downloadFile(
      {
        url: part.url,
        policy: deps.policy,
        maxBytes: part.maxBytes,
        expectedSha256: part.sha256,
        dest,
      },
      {
        signal: ctx.signal,
        fetchImpl: deps.env.fetchImpl,
        onProgress: ({ receivedBytes, totalBytes }) =>
          ctx.progress(
            (0.8 * (i + (totalBytes ? receivedBytes / totalBytes : 0))) / parts.length,
            `Downloaded ${Math.round(receivedBytes / MB)}${totalBytes ? ` of ${Math.round(totalBytes / MB)}` : ''} MB of ${part.name}`,
          ),
      },
    )
    ctx.log(`${part.name}: sha256 ${got.sha256} matches ${OLLAMA_SUMS_ASSET}`)
    files.push(got.path)
  }
}

async function unpack(
  files: string[],
  parts: Part[],
  root: string,
  ctx: InstallContext,
): Promise<void> {
  const staging = `${root}.partial-${newId()}`
  await fs.mkdir(staging, { recursive: true, mode: 0o755 })
  try {
    let budget = OLLAMA_UNPACKED_MAX
    for (const [i, file] of files.entries()) {
      ctx.progress(0.8 + (0.15 * i) / files.length, `Unpacking ${parts[i]!.name}`)
      const r = await extractTarZst(
        file,
        staging,
        { allow: OLLAMA_TAR_ALLOW, maxBytes: budget, maxEntries: 20_000 },
        ctx.signal,
      )
      budget -= r.bytes
      ctx.log(
        `Unpacked ${parts[i]!.name}: ${r.files} files, ${r.symlinks} links, ${Math.round(r.bytes / MB)} MB`,
      )
    }
    const bin = await fs.lstat(join(staging, 'bin', 'ollama')).catch(() => null)
    if (!bin?.isFile() || !(bin.mode & 0o100))
      throw new AppError(
        'VALIDATION',
        'The archive has no bin/ollama program. Nothing was installed.',
      )
    await fs.rename(staging, root)
  } catch (err) {
    await fs.rm(staging, { recursive: true, force: true })
    throw err
  }
}

/** Download, verify and unpack Ollama (plus ticked add-ons) into the per-user folder. */
export async function installOllamaLinux(
  source: InstallerSource,
  addonIds: OllamaAddonId[],
  ctx: InstallContext,
  deps: LinuxInstallDeps,
): Promise<LinuxInstallResult> {
  const { env } = deps
  const addons = checkAddons(env, addonIds)
  const root = ollamaUserDir(env)
  if (env.exists(root))
    throw new AppError(
      'CONFLICT',
      `${root} already exists. Start Ollama from there, or remove the folder to install again.`,
    )
  ctx.progress(0, 'Finding the latest Ollama')
  const listing = deps.urlOverride ?? source.url
  const release = await setupGetJson(listing, deps.policy, {
    signal: ctx.signal,
    fetchImpl: env.fetchImpl,
  })
  const sumsText = await setupGetText(githubAsset(release, OLLAMA_SUMS_ASSET).url, deps.policy, {
    signal: ctx.signal,
    fetchImpl: env.fetchImpl,
    maxBytes: 64 * 1024,
  })
  const parts = verifiedParts(release, parseSha256Sums(sumsText), [
    { name: source.githubAsset!.name, maxBytes: source.maxBytes },
    ...addons.map((a) => ({ name: a.asset, maxBytes: a.maxBytes })),
  ])
  ctx.log(`Ollama ${releaseTag(release) || '(latest)'}: ${parts.map((p) => p.name).join(', ')}`)
  await fs.mkdir(deps.dir, { recursive: true })
  await fs.mkdir(dirname(root), { recursive: true, mode: 0o755 })
  const files: string[] = []
  try {
    await download(parts, files, deps, ctx)
    await unpack(files, parts, root, ctx)
  } finally {
    await Promise.all(files.map((f) => fs.rm(f, { force: true })))
  }
  return { installedAt: root, sha256: parts[0]!.sha256, addons: addons.map((a) => a.id) }
}
