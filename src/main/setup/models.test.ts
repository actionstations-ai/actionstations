// Hardware-based recommendations and model pulls (#334): tiers by memory budget, pulls only
// through the tool's own mechanism, ComfyUI files checked against their pinned sha256.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bytes, redirect, sha256, startServer, type TestServer } from '../packs/test-server'
import { hardwareView, parseNvidiaSmi } from './hardware'
import {
  MODEL_DEFS,
  huggingFaceUrl,
  modelDef,
  parsePercent,
  pullModel,
  recommendModels,
  type ModelDef,
} from './models'
import { assertAllowed } from './fetch'
import { scriptedRunner } from './test-env'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const GiB = 2 ** 30
const none = { ollama: [], lmstudio: [], comfy: [] }
const names = (ms: { name: string }[]) => ms.map((m) => m.name)

describe('hardware', () => {
  it('uses 70% of unified memory on Apple Silicon, VRAM on NVIDIA, else half of RAM on the CPU', () => {
    expect(hardwareView({ platform: 'darwin', arch: 'arm64', ramBytes: 32 * GiB })).toMatchObject({
      appleSilicon: true,
      gpu: true,
      budgetBytes: Math.floor(32 * GiB * 0.7),
    })
    expect(
      hardwareView({ platform: 'win32', arch: 'x64', ramBytes: 64 * GiB, vramBytes: 24 * GiB }),
    ).toMatchObject({ gpu: true, budgetBytes: 24 * GiB })
    expect(hardwareView({ platform: 'linux', arch: 'x64', ramBytes: 16 * GiB })).toMatchObject({
      gpu: false,
      budgetBytes: 8 * GiB,
    })
  })

  it('reads the largest card from nvidia-smi', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 3060, 12288\nNVIDIA RTX 4090, 24564\n')).toEqual({
      name: 'NVIDIA RTX 4090',
      vramBytes: 24564 * 2 ** 20,
    })
    expect(parseNvidiaSmi('')).toBeUndefined()
  })
})

describe('recommendModels', () => {
  const mac = (gb: number) =>
    hardwareView({ platform: 'darwin', arch: 'arm64', ramBytes: gb * GiB })

  it('picks one text model per tool by memory budget', () => {
    expect(names(recommendModels(mac(8), none).filter((m) => m.role === 'text'))).toEqual([
      'qwen3.5:4b',
      'qwen/qwen3.5-4b',
    ])
    expect(names(recommendModels(mac(16), none).filter((m) => m.role === 'text'))).toEqual([
      'qwen3.5:9b',
      'qwen/qwen3.5-9b',
    ])
    expect(names(recommendModels(mac(64), none).filter((m) => m.role === 'text'))).toEqual([
      'qwen3:30b',
      'qwen/qwen3-30b-a3b-2507',
    ])
    expect(names(recommendModels(mac(128), none).filter((m) => m.role === 'text'))).toContain(
      'gpt-oss:120b',
    )
  })

  it('offers image and video models only with a GPU and enough memory', () => {
    expect(recommendModels(mac(16), none).map((m) => m.role)).toContain('image')
    expect(recommendModels(mac(16), none).map((m) => m.role)).not.toContain('video')
    expect(recommendModels(mac(32), none).map((m) => m.role)).toContain('video')
    const cpu = hardwareView({ platform: 'linux', arch: 'x64', ramBytes: 64 * GiB })
    const roles = recommendModels(cpu, none).map((m) => m.role)
    expect(roles).not.toContain('image')
    expect(recommendModels(cpu, none).find((m) => m.role === 'text')!.note).toMatch(/CPU/)
  })

  it('marks what each tool already has', () => {
    const got = recommendModels(mac(64), {
      ollama: ['qwen3:30b', 'nomic-embed-text:latest'],
      lmstudio: [],
      comfy: ['checkpoints/sd_xl_base_1.0.safetensors'],
    })
    const by = Object.fromEntries(got.map((m) => [m.id, m.installed]))
    expect(by['ollama:qwen3:30b']).toBe(true)
    expect(by['ollama:nomic-embed-text']).toBe(true)
    expect(by['lmstudio:qwen/qwen3-30b-a3b-2507']).toBe(false)
    expect(by['comfyui:sdxl-base-1.0']).toBe(true)
    expect(by['comfyui:ltxv-2b-0.9.8']).toBe(false)
  })

  it('offers FLUX.2 klein as an optional image model and finds its three files (#356)', () => {
    expect(recommendModels(mac(16), none).map((m) => m.id)).not.toContain('comfyui:flux2-klein-4b')
    const comfy = [
      'diffusion_models/flux-2-klein-4b.safetensors',
      'text_encoders/qwen_3_4b.safetensors',
    ]
    const find = (have: string[]) =>
      recommendModels(mac(64), { ollama: [], lmstudio: [], comfy: have }).find(
        (m) => m.id === 'comfyui:flux2-klein-4b',
      )!
    expect(find(comfy)).toMatchObject({ license: 'Apache-2.0', installed: false })
    expect(find(comfy).note).toMatch(/Optional/)
    expect(find([...comfy, 'vae/flux2-vae.safetensors']).installed).toBe(true)
    // Files that sit below the repository root download from their path there.
    const [, qwen] = modelDef('comfyui:flux2-klein-4b').files!
    expect(huggingFaceUrl(qwen!)).toBe(
      'https://huggingface.co/Comfy-Org/Z-Image-Turbo/resolve/6fc90a3b1b653e935a0d175e260736de25b84df5/split_files/text_encoders/qwen_3_4b.safetensors',
    )
  })

  it('refuses ids that are not on the list', () => {
    expect(() => modelDef('ollama:evil; rm -rf /')).toThrow(/Unknown recommended model/)
  })
})

describe('pullModel', () => {
  const ctx = () => ({ signal: new AbortController().signal, progress: vi.fn() })

  it('runs lms get with the listed model id and reports its percentages', async () => {
    const run = scriptedRunner(() => ({ stdout: 'Downloading 42.5%\nDone 100%' }))
    const c = { ...ctx(), running: { services: [], urls: {} }, lms: '/u/.lmstudio/bin/lms', run }
    await pullModel(modelDef('lmstudio:qwen/qwen3.5-9b'), c)
    expect(run.calls[0]).toMatchObject({
      cmd: '/u/.lmstudio/bin/lms',
      args: ['get', 'qwen/qwen3.5-9b', '--yes'],
    })
    expect(parsePercent('… 12% … 42.5 %')).toBe(0.425)
  })

  it('asks the user to start Ollama (or open LM Studio once) first', async () => {
    const running = { services: [], urls: {} }
    await expect(
      pullModel(modelDef('ollama:nomic-embed-text'), { ...ctx(), running }),
    ).rejects.toThrow(/Start Ollama first/)
    await expect(
      pullModel(modelDef('lmstudio:qwen/qwen3.5-9b'), { ...ctx(), running }),
    ).rejects.toThrow(/Open LM Studio once/)
  })

  describe('ComfyUI model files', () => {
    let server: TestServer
    const file = randomBytes(32 * 1024)
    beforeAll(async () => {
      server = await startServer()
      server.route('/m/fixture.safetensors', bytes(file))
      server.route('/m/redirected.safetensors', redirect('https://cdn.example.net/x'))
    })
    afterAll(() => server.close())

    const fixture = (name: string, hash: string): ModelDef => ({
      ...MODEL_DEFS.find((d) => d.id === 'comfyui:sdxl-base-1.0')!,
      files: [
        {
          repo: 'test/repo',
          revision: 'abc',
          file: name,
          folder: 'checkpoints',
          sha256: hash,
          sizeBytes: file.length,
        },
      ],
    })

    it('downloads into the checkpoints folder and checks the pinned sha256', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ttx-comfy-'))
      await pullModel(fixture('fixture.safetensors', sha256(file)), {
        ...ctx(),
        running: { services: [], urls: {} },
        comfyFolders: { checkpoints: dir },
        policy: { hosts: [], allowLoopbackHttp: true },
        fileUrl: (f) => server.url(`/m/${f.file}`),
      })
      expect(readdirSync(dir)).toEqual(['fixture.safetensors'])
    })

    it('refuses a file whose sha256 differs and leaves no partial file', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ttx-comfy-'))
      await expect(
        pullModel(fixture('fixture.safetensors', 'f'.repeat(64)), {
          ...ctx(),
          running: { services: [], urls: {} },
          comfyFolders: { checkpoints: dir },
          policy: { hosts: [], allowLoopbackHttp: true },
          fileUrl: (f) => server.url(`/m/${f.file}`),
        }),
      ).rejects.toThrow(/does not match/)
      expect(readdirSync(dir)).toEqual([])
      expect(existsSync(join(dir, 'fixture.safetensors'))).toBe(false)
    })

    it('refuses a redirect off the allowed hosts', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ttx-comfy-'))
      await expect(
        pullModel(fixture('redirected.safetensors', sha256(file)), {
          ...ctx(),
          running: { services: [], urls: {} },
          comfyFolders: { checkpoints: dir },
          policy: { hosts: ['huggingface.co'], allowLoopbackHttp: true },
          fileUrl: (f) => server.url(`/m/${f.file}`),
        }),
      ).rejects.toThrow(/cdn\.example\.net: it is not one of the vendor's download hosts/)
    })
  })
})

describe('assertAllowed', () => {
  it('allows https on listed hosts and suffixes only', () => {
    const p = { hosts: ['huggingface.co', '.hf.co'] }
    expect(assertAllowed('https://huggingface.co/a', p).host).toBe('huggingface.co')
    expect(assertAllowed('https://us.aws.cdn.hf.co/x', p).host).toBe('us.aws.cdn.hf.co')
    expect(() => assertAllowed('https://evilhf.co/x', p)).toThrow(/not one of/)
    expect(() => assertAllowed('http://huggingface.co/a', p)).toThrow(/https/)
    expect(() => assertAllowed('http://127.0.0.1:9/a', p)).toThrow(/https/)
    expect(() => assertAllowed('https://u:p@huggingface.co/a', p)).toThrow(/user name/)
  })
})
