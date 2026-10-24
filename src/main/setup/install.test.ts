// One-click install (#334) against a local http server and fixture installers: the vendor's
// sha256 and the publisher signature must both pass before anything is opened or copied, and
// a refused download leaves nothing behind. No real installer is downloaded.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  bytes,
  json,
  redirect,
  sha256,
  stall,
  startServer,
  type TestServer,
} from '../packs/test-server'
import { githubAsset, installTool, type InstallDeps } from './install'
import { CODESIGN_ADHOC, CODESIGN_LMSTUDIO, fakeMachine, scriptedRunner } from './test-env'
import type { Runner } from './run'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

let server: TestServer
const installer = randomBytes(64 * 1024)
const release = (digest: string) => ({
  tag_name: 'v0.40.11',
  assets: [
    {
      name: 'Ollama.dmg',
      browser_download_url: server.url('/Ollama.dmg'),
      digest: `sha256:${digest}`,
    },
    {
      name: 'OllamaSetup.exe',
      browser_download_url: server.url('/OllamaSetup.exe'),
      digest: `sha256:${digest}`,
    },
  ],
})

beforeAll(async () => {
  server = await startServer()
  server.route('/OllamaSetup.exe', bytes(installer))
  server.route('/Ollama.dmg', bytes(installer))
  server.route('/lms-final.exe', bytes(installer))
  server.route('/lms.exe', redirect('/lms-final.exe'))
  server.route('/LM-Studio.dmg', bytes(installer))
  server.route('/release-ok', json({}))
  server.route('/stall.exe', stall(installer.subarray(0, 1024)))
})
afterAll(() => server.close())

let dir: string
let apps: string
beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), 'ttx-setup-'))
  dir = join(root, 'downloads')
  apps = join(root, 'Applications')
  mkdirSync(apps)
  server.route('/release-ok', json(release(sha256(installer))))
  server.route('/release-bad', json(release('0'.repeat(64))))
})

const ctx = (signal = new AbortController().signal) => ({
  signal,
  progress: vi.fn(),
  log: vi.fn(),
})

function deps(platform: NodeJS.Platform, run: Runner, over: Partial<InstallDeps> = {}) {
  const m = fakeMachine({ platform, arch: platform === 'win32' ? 'x64' : 'arm64', home: dir })
  const openPath = vi.fn(async () => '')
  return {
    openPath,
    deps: {
      env: { ...m.env, fetchImpl: fetch },
      dir,
      run,
      openPath,
      policy: { hosts: [], allowLoopbackHttp: true },
      applicationsDir: apps,
      ...over,
    } satisfies InstallDeps,
  }
}

const leftovers = () => (existsSync(dir) ? readdirSync(dir) : [])

const goodWin = (cn: string) =>
  scriptedRunner(() => ({ stdout: JSON.stringify({ Status: 'Valid', Subject: `CN=${cn}, O=x` }) }))

describe('installTool on Windows', () => {
  it('checks the published sha256 and the signer, then opens the installer', async () => {
    const run = goodWin('Ollama Inc.')
    const { deps: d, openPath } = deps('win32', run, { urlOverride: server.url('/release-ok') })
    const r = await installTool('ollama', ctx(), d)
    expect(r).toMatchObject({ tool: 'ollama', installerOpened: true, sha256Checked: true })
    expect(r.sha256).toBe(sha256(installer))
    expect(openPath).toHaveBeenCalledTimes(1)
    expect(run.calls[0]!.cmd).toBe('powershell.exe')
  })

  it('refuses a sha256 mismatch before any signature check, leaving nothing', async () => {
    const run = goodWin('Ollama Inc.')
    const { deps: d, openPath } = deps('win32', run, { urlOverride: server.url('/release-bad') })
    await expect(installTool('ollama', ctx(), d)).rejects.toThrow(
      /does not match the vendor's published sha256/,
    )
    expect(run.calls).toHaveLength(0)
    expect(openPath).not.toHaveBeenCalled()
    expect(leftovers()).toEqual([])
  })

  it('refuses an installer signed by someone else and deletes it', async () => {
    const run = goodWin('Mallory Software Ltd')
    const { deps: d, openPath } = deps('win32', run, { urlOverride: server.url('/lms.exe') })
    await expect(installTool('lmstudio', ctx(), d)).rejects.toThrow(
      /signed by "Mallory Software Ltd", not "Element Labs Inc\."/,
    )
    expect(openPath).not.toHaveBeenCalled()
    expect(leftovers()).toEqual([])
  })

  it('refuses plain http and hosts outside the vendor allowlist', async () => {
    const { deps: d } = deps('win32', goodWin('Element Labs Inc.'), {
      urlOverride: server.url('/lms.exe'),
      policy: { hosts: ['installers.lmstudio.ai'] },
    })
    await expect(installTool('lmstudio', ctx(), d)).rejects.toThrow(/must use https/)
    const { deps: d2 } = deps('win32', goodWin('Element Labs Inc.'), {
      urlOverride: 'https://downloads.example.net/LM-Studio.exe',
      policy: { hosts: ['installers.lmstudio.ai'] },
    })
    await expect(installTool('lmstudio', ctx(), d2)).rejects.toThrow(
      /downloads\.example\.net: it is not one of the vendor's download hosts/,
    )
  })

  it('cancels a download and removes the partial file', async () => {
    const ac = new AbortController()
    const { deps: d, openPath } = deps('win32', goodWin('Element Labs Inc.'), {
      urlOverride: server.url('/stall.exe'),
    })
    const p = installTool('lmstudio', ctx(ac.signal), d)
    setTimeout(() => ac.abort(), 150)
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(openPath).not.toHaveBeenCalled()
    expect(leftovers()).toEqual([])
  })
})

/** hdiutil / codesign / spctl / ditto stand-ins; `dv` is what codesign -dv prints. */
function macRunner(dv: string) {
  return scriptedRunner((cmd, args) => {
    if (cmd === 'hdiutil' && args[0] === 'attach') {
      const mount = args[args.indexOf('-mountpoint') + 1]!
      mkdirSync(join(mount, 'LM Studio.app'), { recursive: true })
      return {}
    }
    if (cmd === 'hdiutil') return {}
    if (cmd === 'codesign' && args[0] === '--verify') return {}
    if (cmd === 'codesign') return { stderr: dv }
    if (cmd === 'spctl') return { stderr: 'accepted\nsource=Notarized Developer ID' }
    if (cmd === 'ditto') {
      mkdirSync(args[1]!, { recursive: true })
      return {}
    }
    return { code: 127 }
  })
}

describe('installTool on macOS', () => {
  it('mounts read-only, verifies the team, copies the app and verifies the copy', async () => {
    const run = macRunner(CODESIGN_LMSTUDIO)
    const { deps: d } = deps('darwin', run, { urlOverride: server.url('/LM-Studio.dmg') })
    const r = await installTool('lmstudio', ctx(), d)
    expect(r.installedAt).toBe(join(apps, 'LM Studio.app'))
    expect(r.sha256Checked).toBe(false)
    const cmds = run.calls.map((c) => `${c.cmd} ${c.args[0]}`)
    expect(cmds[0]).toBe('hdiutil attach')
    expect(run.calls[0]!.args).toEqual(expect.arrayContaining(['-readonly', '-nobrowse']))
    expect(cmds.filter((c) => c === 'codesign --verify')).toHaveLength(2)
    expect(cmds.at(-1)).toBe('hdiutil detach')
    expect(leftovers().filter((f) => f.endsWith('.dmg'))).toEqual([])
  })

  it('refuses an ad-hoc signed app: nothing is copied and the image is detached', async () => {
    const run = macRunner(CODESIGN_ADHOC)
    const { deps: d } = deps('darwin', run, { urlOverride: server.url('/LM-Studio.dmg') })
    await expect(installTool('lmstudio', ctx(), d)).rejects.toThrow(/no Developer ID team/)
    expect(run.calls.some((c) => c.cmd === 'ditto')).toBe(false)
    expect(run.calls.at(-1)).toMatchObject({
      cmd: 'hdiutil',
      args: expect.arrayContaining(['detach']),
    })
    expect(readdirSync(apps)).toEqual([])
    expect(leftovers().filter((f) => f.endsWith('.dmg'))).toEqual([])
  })
})

describe('platform checks', () => {
  it('has no one-click install on Linux', async () => {
    const { deps: d } = deps('linux', goodWin('x'))
    await expect(
      installTool('ollama', ctx(), { ...d, env: { ...d.env, arch: 'x64' } }),
    ).rejects.toThrow(/no one-click install on this computer/)
  })

  it('reads the asset and digest from a GitHub release listing', () => {
    const r = githubAsset(
      {
        assets: [
          {
            name: 'Ollama.dmg',
            browser_download_url: 'https://github.com/x',
            digest: 'sha256:' + 'AB'.repeat(32),
          },
        ],
      },
      'Ollama.dmg',
    )
    expect(r).toEqual({ url: 'https://github.com/x', sha256: 'ab'.repeat(32) })
    expect(() => githubAsset({ assets: [] }, 'Ollama.dmg')).toThrow(/has no Ollama.dmg/)
  })
})
