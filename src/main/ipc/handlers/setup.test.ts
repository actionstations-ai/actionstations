// setup:* through the IPC dispatcher (#334): status only probes 127.0.0.1 and never starts a
// job; installs and pulls are jobs started by their own channel; the download page opens in
// the browser and is never fetched.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const shell = vi.hoisted(() => ({ openExternal: vi.fn(async () => undefined), openPath: vi.fn() }))
vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
  shell,
}))

const { dispatch } = await import('../registry')
const handlers = (await import('./setup')).default
const { setupDeps } = await import('./setup')
const { jobs } = await import('../../jobs/manager')
const { fakeMachine, scriptedRunner } = await import('../../setup/test-env')

async function call<T = unknown>(channel: string, req?: unknown): Promise<T> {
  const res = await dispatch(handlers, channel, req)
  if (!res.ok) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

const waitDone = async (jobId: string) => {
  for (let i = 0; i < 200; i++) {
    const j = jobs.get(jobId)
    if (j.status === 'done' || j.status === 'error' || j.status === 'cancelled') return j
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error('job did not finish')
}

let machine: ReturnType<typeof fakeMachine>
beforeEach(() => {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  machine = fakeMachine({
    home: '/Users/t',
    files: ['/Applications/Ollama.app'],
    answering: { 'http://127.0.0.1:1234/': { data: [{ id: 'qwen/qwen3.5-9b' }] } },
  })
  for (const k of Object.keys(setupDeps)) delete (setupDeps as Record<string, unknown>)[k]
  setupDeps.env = () => machine.env
  setupDeps.hardware = async () => ({ platform: 'darwin', arch: 'arm64', ramBytes: 32 * 2 ** 30 })
  shell.openExternal.mockClear()
})

describe('setup:status', () => {
  it('reports each tool, the hardware and the models, contacting only 127.0.0.1', async () => {
    const before = jobs.list({}).length
    const s = await call<{
      tools: { id: string; state: string }[]
      hardware: { appleSilicon: boolean }
      models: { id: string; installed: boolean }[]
    }>('setup:status')
    expect(Object.fromEntries(s.tools.map((t) => [t.id, t.state]))).toEqual({
      lmstudio: 'running',
      ollama: 'installed',
      comfyui: 'missing',
      voice: 'missing',
    })
    expect(s.hardware.appleSilicon).toBe(true)
    expect(s.models.find((m) => m.id === 'lmstudio:qwen/qwen3.5-9b')).toBeUndefined()
    expect(s.models.find((m) => m.id === 'lmstudio:qwen/qwen3-30b-a3b-2507')?.installed).toBe(false)
    expect(machine.fetched.every((u) => u.startsWith('http://127.0.0.1:'))).toBe(true)
    expect(jobs.list({}).length).toBe(before)
  })
})

describe('setup:install', () => {
  it('starts one tool-install job per tool and reports a refusal as the job error', async () => {
    machine.env.platform = 'linux'
    machine.env.arch = 'x64'
    const { jobId } = await call<{ jobId: string }>('setup:install', { tool: 'ollama' })
    expect(jobs.get(jobId).kind).toBe('tool-install')
    const job = await waitDone(jobId)
    expect(job.status).toBe('error')
    expect(job.error).toMatch(/no one-click install on this computer/)
  })

  it('rejects an unknown tool', async () => {
    await expect(call('setup:install', { tool: 'blender' })).rejects.toMatchObject({
      code: 'VALIDATION',
    })
  })
})

describe('setup:open-page', () => {
  it('opens the pinned vendor page in the browser without fetching it', async () => {
    await call('setup:open-page', { tool: 'comfyui' })
    expect(shell.openExternal).toHaveBeenCalledWith('https://www.comfy.org/download')
    expect(machine.fetched).toEqual([])
  })
})

describe('setup:start', () => {
  it('starts an installed app and reports when it answers', async () => {
    const run = scriptedRunner(() => ({}))
    setupDeps.run = run
    setupDeps.startWaitMs = 0
    machine = fakeMachine({
      files: ['/Applications/Ollama.app'],
      answering: { 'http://127.0.0.1:11434/': { models: [] } },
    })
    const r = await call<{ running: boolean }>('setup:start', { tool: 'ollama' })
    expect(r.running).toBe(true)
    expect(run.calls[0]).toEqual({ cmd: 'open', args: ['-a', '/Applications/Ollama.app'] })
  })

  it('refuses to start a tool that is not installed', async () => {
    await expect(call('setup:start', { tool: 'comfyui' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })
})

describe('setup:pull-model', () => {
  it('accepts only ids from the recommended list', async () => {
    await expect(call('setup:pull-model', { modelId: 'ollama:anything' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('runs the pull as a model-pull job that asks for the tool to be started', async () => {
    const { jobId } = await call<{ jobId: string }>('setup:pull-model', {
      modelId: 'ollama:nomic-embed-text',
    })
    const job = await waitDone(jobId)
    expect(job.kind).toBe('model-pull')
    expect(job.error).toMatch(/Start Ollama first/)
  })
})
