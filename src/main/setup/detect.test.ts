// Detection (#334): each tool is Detected (answers on 127.0.0.1), Installed but not running
// (found on disk), or Not installed, with the right install method for the platform.
import { describe, expect, it } from 'vitest'
import { detectTools, toolView, probeRunning } from './detect'
import { fakeMachine } from './test-env'

const byId = async (m: ReturnType<typeof fakeMachine>) => {
  const { tools } = await detectTools(m.env)
  return Object.fromEntries(tools.map((t) => [t.id, t]))
}

describe('detectTools', () => {
  it('reports Detected for tools answering on 127.0.0.1, with their base URL', async () => {
    const m = fakeMachine({
      files: ['/Applications/LM Studio.app', '/opt/homebrew/bin/ollama'],
      answering: {
        'http://127.0.0.1:1234/': { data: [{ id: 'qwen/qwen3.5-9b' }] },
        'http://127.0.0.1:11434/': { models: [{ name: 'qwen3.5:9b' }] },
        'http://127.0.0.1:8188/system_stats': { system: {} },
        'http://127.0.0.1:8765/v1/models': { data: [] },
      },
    })
    const t = await byId(m)
    expect(t.lmstudio).toMatchObject({ state: 'running', baseUrl: 'http://127.0.0.1:1234/v1' })
    expect(t.ollama).toMatchObject({ state: 'running', baseUrl: 'http://127.0.0.1:11434' })
    expect(t.comfyui).toMatchObject({ state: 'running', baseUrl: 'http://127.0.0.1:8188' })
    expect(t.voice).toMatchObject({ state: 'running', baseUrl: 'http://127.0.0.1:8765/v1' })
    expect(Object.values(t).every((v) => v.canStart === false)).toBe(true)
  })

  it('finds ComfyUI Desktop on its own port 8000', async () => {
    const m = fakeMachine({ answering: { 'http://127.0.0.1:8000/system_stats': {} } })
    expect((await probeRunning(m.env)).urls.comfyui).toBe('http://127.0.0.1:8000')
  })

  it('reports Installed, not running, with Start, for apps and CLIs on disk', async () => {
    const m = fakeMachine({
      home: '/Users/test',
      files: [
        '/Users/test/Applications/Ollama.app',
        '/Applications/Comfy Desktop.app',
        '/Users/test/.lmstudio/bin/lms',
        '/Users/test/.local/bin/mlx_audio.server',
      ],
    })
    const t = await byId(m)
    for (const id of ['lmstudio', 'ollama', 'comfyui', 'voice'])
      expect(t[id]).toMatchObject({ state: 'installed', canStart: true })
    expect(t.ollama!.foundAt).toBe('/Users/test/Applications/Ollama.app')
  })

  it('treats a ComfyUI git checkout as installed but not startable', async () => {
    const m = fakeMachine({ files: ['/Users/test/ComfyUI/main.py'] })
    expect((await byId(m)).comfyui).toMatchObject({ state: 'installed', canStart: false })
  })

  it('reports Not installed with one-click install on Apple Silicon, guided voice', async () => {
    const t = await byId(fakeMachine({}))
    expect(t.lmstudio).toMatchObject({ state: 'missing', method: 'install' })
    expect(t.lmstudio!.verification).toMatch(/Team ID D65G88RHWN/)
    expect(t.ollama!.verification).toMatch(/sha256/)
    expect(t.comfyui).toMatchObject({ state: 'missing', method: 'install' })
    expect(t.voice).toMatchObject({ method: 'guided', command: 'uv tool install mlx-audio' })
  })

  it('offers one-click Ollama on Linux, the page for the rest, and marks unsupported platforms', async () => {
    const linux = await byId(fakeMachine({ platform: 'linux', arch: 'x64', home: '/home/t' }))
    expect(linux.lmstudio!.method).toBe('page')
    expect(linux.ollama!.method).toBe('install')
    expect(linux.ollama!.verification).toMatch(
      /sha256sum\.txt.*\/home\/t\/\.local\/share\/actionstations\/tools\/ollama without sudo/,
    )
    expect(linux.ollama!.sizeLabel).toMatch(/1\.5 GB download/)
    expect(linux.ollama!.addons).toBeUndefined()
    expect(linux.comfyui!.method).toBe('page')
    const riscv = await byId(fakeMachine({ platform: 'linux', arch: 'riscv64' }))
    expect(riscv.ollama!.method).toBe('page')
    expect(linux.voice!.method).toBe('unsupported')
    const intel = await byId(fakeMachine({ platform: 'darwin', arch: 'x64' }))
    expect(intel.lmstudio!.method).toBe('unsupported')
    expect(intel.ollama!.method).toBe('install')
    expect(intel.comfyui!.method).toBe('unsupported')
  })

  it('looks in the Windows per-user Programs folder', () => {
    const m = fakeMachine({
      platform: 'win32',
      arch: 'x64',
      home: 'C:\\Users\\t',
      files: ['C:\\Users\\t\\AppData\\Local\\Programs\\Ollama\\ollama.exe'],
    })
    const v = toolView('ollama', m.env, { services: [], urls: {} })
    expect(v).toMatchObject({ state: 'installed', method: 'install', canStart: true })
    expect(v.verification).toMatch(/Ollama Inc\. \(Authenticode\)/)
  })

  it('prefers a system-wide Ollama on Linux over the per-user copy', () => {
    const own = '/home/t/.local/share/actionstations/tools/ollama/bin/ollama'
    const both = fakeMachine({
      platform: 'linux',
      arch: 'x64',
      home: '/home/t',
      files: ['/usr/bin/ollama', own],
    })
    expect(toolView('ollama', both.env, { services: [], urls: {} })).toMatchObject({
      state: 'installed',
      foundAt: '/usr/bin/ollama',
      canStart: true,
    })
    const mine = fakeMachine({ platform: 'linux', arch: 'x64', home: '/home/t', files: [own] })
    expect(toolView('ollama', mine.env, { services: [], urls: {} }).foundAt).toBe(own)
  })

  it('offers the ROCm add-on on Linux only when an AMD GPU driver is present', () => {
    const m = fakeMachine({ platform: 'linux', arch: 'x64', files: ['/dev/kfd'] })
    const v = toolView('ollama', m.env, { services: [], urls: {} })
    expect(v.addons?.map((a) => a.id)).toEqual(['rocm'])
    expect(v.addons?.[0]?.reason).toMatch(/AMD GPU/)
  })

  it('only ever contacts 127.0.0.1', async () => {
    const m = fakeMachine({})
    await detectTools(m.env)
    expect(m.fetched.length).toBeGreaterThan(0)
    expect(m.fetched.every((u) => u.startsWith('http://127.0.0.1:'))).toBe(true)
  })
})
