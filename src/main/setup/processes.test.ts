// Tool servers the app starts and stops (#338): on Linux `ollama serve` runs as a user process
// the app owns, bound to 127.0.0.1, with its output in a log file; Stop and quitting end it,
// and a server the app did not start is never touched. The child here is a small Node script.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ToolProcesses, type Spawn } from './processes'
import { OLLAMA_ENV, startTool, stopTool } from './start'
import { fakeMachine } from './test-env'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getVersion: () => '0.0.1', getPath: () => tmpdir() },
  BrowserWindow: { getAllWindows: () => [] },
}))

const SERVER = 'console.log("listening", process.env.OLLAMA_HOST); setInterval(() => {}, 1000)'

/** Runs a Node script in place of the real program, and records what was asked for. */
function nodeSpawn(script: string) {
  const calls: { cmd: string; args: string[]; env?: NodeJS.ProcessEnv }[] = []
  const impl: Spawn = (cmd, args, opts) => {
    calls.push({ cmd, args, ...(opts?.env ? { env: opts.env } : {}) })
    return spawn(process.execPath, ['-e', script], opts ?? {})
  }
  return { impl, calls }
}

const live: ToolProcesses[] = []
afterEach(async () => {
  for (const p of live.splice(0)) await p.stop('ollama', 200)
})

describe('ToolProcesses', () => {
  it('starts a server once, logs its output, and stops it', async () => {
    const { impl, calls } = nodeSpawn(SERVER)
    const procs = new ToolProcesses(impl)
    live.push(procs)
    const log = join(mkdtempSync(join(tmpdir(), 'ttx-proc-')), 'logs', 'ollama.log')
    procs.start('ollama', { cmd: '/x/ollama', args: ['serve'], env: OLLAMA_ENV, logFile: log })
    procs.start('ollama', { cmd: '/x/ollama', args: ['serve'] })
    expect(calls).toHaveLength(1)
    expect(procs.has('ollama')).toBe(true)
    await vi.waitFor(() => expect(readFileSync(log, 'utf8')).toContain('listening 127.0.0.1:11434'))
    expect(await procs.stop('ollama')).toBe(true)
    expect(procs.has('ollama')).toBe(false)
    expect(procs.exitOf('ollama')?.signal).toBe('SIGTERM')
  })

  it('kills a server that ignores SIGTERM after the grace period', async () => {
    const { impl } = nodeSpawn(`process.on('SIGTERM', () => {}); ${SERVER}`)
    const procs = new ToolProcesses(impl)
    procs.start('ollama', { cmd: '/x/ollama', args: ['serve'] })
    await new Promise((r) => setTimeout(r, 300))
    expect(await procs.stop('ollama', 200)).toBe(true)
    expect(procs.exitOf('ollama')?.signal).toBe('SIGKILL')
  })

  it('stopAll asks every server it started to stop (before-quit)', async () => {
    const { impl } = nodeSpawn(SERVER)
    const procs = new ToolProcesses(impl)
    procs.start('ollama', { cmd: '/x/ollama', args: ['serve'] })
    procs.stopAll()
    await vi.waitFor(() => expect(procs.has('ollama')).toBe(false))
  })
})

describe('startTool and stopTool for Ollama on Linux', () => {
  const linux = (answering: Record<string, unknown> = {}) =>
    fakeMachine({
      platform: 'linux',
      arch: 'x64',
      home: '/home/t',
      files: ['/home/t/.local/share/actionstations/tools/ollama/bin/ollama'],
      answering,
    })

  it('runs `ollama serve` as a managed user process bound to 127.0.0.1', async () => {
    const { impl, calls } = nodeSpawn(SERVER)
    const procs = new ToolProcesses(impl)
    live.push(procs)
    const m = linux({ 'http://127.0.0.1:11434/': { models: [] } })
    const r = await startTool('ollama', { env: m.env, processes: procs, waitMs: 0 })
    expect(r.running).toBe(true)
    expect(calls[0]).toMatchObject({
      cmd: '/home/t/.local/share/actionstations/tools/ollama/bin/ollama',
      args: ['serve'],
    })
    expect(calls[0]!.env?.OLLAMA_HOST).toBe('127.0.0.1:11434')
    expect(procs.has('ollama')).toBe(true)
    expect(await stopTool('ollama', procs)).toEqual({ stopped: true, message: 'Ollama stopped' })
  })

  it('reports a server that exits right away, pointing at the log', async () => {
    const { impl } = nodeSpawn('process.exit(3)')
    const procs = new ToolProcesses(impl)
    const r = await startTool('ollama', {
      env: linux().env,
      processes: procs,
      waitMs: 3000,
      sleep: (ms) => new Promise((res) => setTimeout(res, Math.min(ms, 50))),
      logDir: '/tmp/ttx-logs-not-written',
    })
    expect(r.running).toBe(false)
    expect(r.message).toMatch(/stopped right after starting \(exit code 3\).*ollama\.log/)
  })

  it('leaves a server it did not start alone', async () => {
    const r = await stopTool('ollama', new ToolProcesses(nodeSpawn(SERVER).impl))
    expect(r.stopped).toBe(false)
    expect(r.message).toMatch(/not started by Action Stations/)
  })
})
