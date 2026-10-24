// One-click Ollama on Linux (#338) against a local http server and fixture tarballs: the
// release lookup, Ollama's published sha256 (and GitHub's digest) before anything is
// unpacked, safe extraction into the per-user folder, GPU add-ons only when the hardware is
// there, and a system-wide install preferred over a second copy. No real binary is downloaded.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bytes, json, sha256, startServer, type TestServer } from '../packs/test-server'
import { TOOLS } from './catalog'
import { installTool, type InstallDeps } from './install'
import {
  offeredAddons,
  ollamaUserBin,
  ollamaUserDir,
  parseSha256Sums,
  verifiedParts,
} from './linux-ollama'
import { buildTar, ollamaTarball, rocmTarball, zst } from './tar-fixture'
import { fakeMachine, scriptedRunner } from './test-env'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const MAIN = 'ollama-linux-amd64.tar.zst'
const ROCM = 'ollama-linux-amd64-rocm.tar.zst'
const main = ollamaTarball()
const rocm = rocmTarball()
const escape = zst(
  buildTar([
    { name: 'bin/ollama', data: 'x', mode: 0o755 },
    { name: '../../.bashrc', data: 'evil' },
  ]),
)

let server: TestServer
beforeAll(async () => {
  server = await startServer()
  server.route(`/${MAIN}`, bytes(main))
  server.route(`/${ROCM}`, bytes(rocm))
  server.route('/escape.tar.zst', bytes(escape))
})
afterAll(() => server.close())

const sumsText = (over: Record<string, string> = {}) =>
  Object.entries({ [MAIN]: sha256(main), [ROCM]: sha256(rocm), ...over })
    .map(([name, h]) => `${h}  ./${name}`)
    .join('\n')

/** A release listing like api.github.com's, pointing at the fixture server. */
function release(opts: { digests?: Record<string, string>; files?: Record<string, string> } = {}) {
  const files = { [MAIN]: `/${MAIN}`, [ROCM]: `/${ROCM}`, ...opts.files }
  return {
    tag_name: 'v0.40.11',
    assets: [
      ...Object.entries(files).map(([name, path]) => ({
        name,
        browser_download_url: server.url(path),
        ...(opts.digests?.[name] ? { digest: `sha256:${opts.digests[name]}` } : {}),
      })),
      { name: 'sha256sum.txt', browser_download_url: server.url('/sha256sum.txt') },
    ],
  }
}

let home: string
let dl: string
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'ttx-linux-home-'))
  dl = join(home, 'downloads')
  server.route('/release', json(release({ digests: { [MAIN]: sha256(main) } })))
  server.route('/sha256sum.txt', (_req, res) => res.end(sumsText()))
})

const ctx = (signal = new AbortController().signal) => ({ signal, progress: vi.fn(), log: vi.fn() })

function linuxDeps(over: { files?: string[]; arch?: string; tegra?: string } = {}): InstallDeps {
  const m = fakeMachine({ platform: 'linux', arch: over.arch ?? 'x64', home, files: over.files })
  const env = {
    ...m.env,
    // Real files for the folder checks, plus the fake hardware files.
    exists: (p: string) => (over.files ?? []).includes(p) || existsSync(p),
    readText: (p: string) => (p === '/etc/nv_tegra_release' ? over.tegra : undefined),
    fetchImpl: fetch,
  }
  return {
    env,
    dir: dl,
    run: scriptedRunner(() => ({ code: 127 })),
    openPath: vi.fn(async () => ''),
    policy: { hosts: [], allowLoopbackHttp: true },
    urlOverride: server.url('/release'),
  }
}

const downloadsLeft = () => (existsSync(dl) ? readdirSync(dl) : [])
const toolsDir = () => join(home, '.local', 'share', 'actionstations', 'tools')

describe('installTool on Linux', () => {
  it('checks the published sha256, unpacks into the per-user folder and runs nothing', async () => {
    const d = linuxDeps()
    const r = await installTool('ollama', ctx(), d)
    expect(r).toMatchObject({ tool: 'ollama', sha256Checked: true, signer: '' })
    expect(r.sha256).toBe(sha256(main))
    expect(r.installedAt).toBe(join(toolsDir(), 'ollama'))
    expect(statSync(ollamaUserBin(d.env)).mode & 0o111).toBeTruthy()
    expect(readdirSync(toolsDir())).toEqual(['ollama'])
    expect(downloadsLeft()).toEqual([])
    expect((d.run as ReturnType<typeof scriptedRunner>).calls).toEqual([])
    expect(server.hits).toContain('/sha256sum.txt')
  })

  it('follows $XDG_DATA_HOME when it is absolute', async () => {
    const d = linuxDeps()
    const xdg = join(home, 'xdg')
    d.env.xdgDataHome = xdg
    const r = await installTool('ollama', ctx(), d)
    expect(r.installedAt).toBe(join(xdg, 'actionstations', 'tools', 'ollama'))
  })

  it('adds the ROCm add-on when an AMD GPU driver is present and it was ticked', async () => {
    const d = linuxDeps({ files: ['/dev/kfd'] })
    const r = await installTool('ollama', ctx(), d, { addons: ['rocm'] })
    expect(r.addons).toEqual(['rocm'])
    expect(existsSync(join(r.installedAt!, 'lib/ollama/rocm_v7_2/libamdhip64.so.7'))).toBe(true)
  })

  it('refuses an add-on the hardware does not support, before downloading', async () => {
    const before = server.hits.length
    await expect(installTool('ollama', ctx(), linuxDeps(), { addons: ['rocm'] })).rejects.toThrow(
      /AMD ROCm support is not offered on this computer/,
    )
    expect(server.hits.length).toBe(before)
  })

  it('refuses a tarball whose bytes do not match sha256sum.txt and leaves nothing', async () => {
    server.route('/sha256sum.txt', (_req, res) => res.end(sumsText({ [MAIN]: 'a'.repeat(64) })))
    server.route('/release', json(release()))
    await expect(installTool('ollama', ctx(), linuxDeps())).rejects.toThrow(
      /does not match the vendor's published sha256/,
    )
    expect(existsSync(toolsDir()) ? readdirSync(toolsDir()) : []).toEqual([])
    expect(downloadsLeft()).toEqual([])
  })

  it('refuses when sha256sum.txt and the GitHub digest disagree, before downloading', async () => {
    server.route('/release', json(release({ digests: { [MAIN]: 'b'.repeat(64) } })))
    const before = server.hits.filter((h) => h === `/${MAIN}`).length
    await expect(installTool('ollama', ctx(), linuxDeps())).rejects.toThrow(
      /differs from GitHub's digest/,
    )
    expect(server.hits.filter((h) => h === `/${MAIN}`).length).toBe(before)
  })

  it('refuses a tarball sha256sum.txt does not list', async () => {
    server.route('/sha256sum.txt', (_req, res) => res.end(`${'c'.repeat(64)}  ./other.tar.zst\n`))
    await expect(installTool('ollama', ctx(), linuxDeps())).rejects.toThrow(
      /lists no checksum for ollama-linux-amd64.tar.zst/,
    )
  })

  it('refuses an archive that writes outside the folder; nothing is installed', async () => {
    server.route('/release', json(release({ files: { [MAIN]: '/escape.tar.zst' } })))
    server.route('/sha256sum.txt', (_req, res) => res.end(sumsText({ [MAIN]: sha256(escape) })))
    await expect(installTool('ollama', ctx(), linuxDeps())).rejects.toThrow(
      /points outside the install folder/,
    )
    expect(readdirSync(toolsDir())).toEqual([])
    expect(existsSync(join(home, '.bashrc'))).toBe(false)
    expect(downloadsLeft()).toEqual([])
  })

  it('prefers a system-wide install: no second copy is downloaded', async () => {
    const before = server.hits.length
    await expect(
      installTool('ollama', ctx(), linuxDeps({ files: ['/usr/local/bin/ollama'] })),
    ).rejects.toThrow(/already installed at \/usr\/local\/bin\/ollama; press Start/)
    expect(server.hits.length).toBe(before)
  })

  it('refuses to unpack over its own earlier install', async () => {
    const d = linuxDeps()
    mkdirSync(join(ollamaUserDir(d.env), 'bin'), { recursive: true })
    await expect(installTool('ollama', ctx(), d)).rejects.toThrow(/already/)
  })

  it('reads arm64 from its own asset', () => {
    expect(TOOLS.ollama.sources['linux-arm64']?.githubAsset?.name).toBe(
      'ollama-linux-arm64.tar.zst',
    )
  })
})

describe('Linux helpers', () => {
  it('parses sha256sum.txt as Ollama publishes it', () => {
    const sums = parseSha256Sums(
      `${'A'.repeat(64)}  ./ollama-linux-amd64.tar.zst\n${'b'.repeat(64)}  ./Ollama.dmg\njunk line\n`,
    )
    expect(sums.get('ollama-linux-amd64.tar.zst')).toBe('a'.repeat(64))
    expect(sums.get('Ollama.dmg')).toBe('b'.repeat(64))
    expect(sums.size).toBe(2)
  })

  it('takes the checksum file over a missing digest, and refuses a missing asset', () => {
    const rel = { assets: [{ name: MAIN, browser_download_url: 'https://github.com/x' }] }
    const parts = verifiedParts(rel, new Map([[MAIN, 'd'.repeat(64)]]), [
      { name: MAIN, maxBytes: 1 },
    ])
    expect(parts[0]).toMatchObject({ url: 'https://github.com/x', sha256: 'd'.repeat(64) })
    expect(() => verifiedParts(rel, new Map(), [{ name: ROCM, maxBytes: 1 }])).toThrow(/has no/)
  })

  it('offers GPU add-ons only for the hardware found', () => {
    const env = (arch: string, files: string[] = [], tegra?: string) => ({
      ...fakeMachine({ platform: 'linux', arch, files }).env,
      readText: () => tegra,
    })
    expect(offeredAddons(env('x64'))).toEqual([])
    expect(offeredAddons(env('x64', ['/dev/kfd'])).map((a) => a.id)).toEqual(['rocm'])
    expect(offeredAddons(env('arm64', ['/dev/kfd']))).toEqual([])
    expect(
      offeredAddons(env('arm64', [], '# R36 (release), REVISION: 4.3')).map((a) => a.id),
    ).toEqual(['jetpack6'])
    expect(
      offeredAddons(env('arm64', [], '# R35 (release), REVISION: 5.0')).map((a) => a.id),
    ).toEqual(['jetpack5'])
    expect(offeredAddons({ ...env('x64', ['/dev/kfd']), platform: 'darwin' })).toEqual([])
  })
})
