// Tool servers the app started itself and can stop again (#338): today `ollama serve` on Linux.
// The child is a normal user process (no shell, no detaching), its output goes to a log file
// under userData, and the app stops it from the Stop button or when it quits. A server the app
// did not start (a systemd service, one the user ran) is never touched.
import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ToolId } from '@shared/schemas/setup'

export interface ManagedStart {
  cmd: string
  args: string[]
  /** Extra environment variables for the child. */
  env?: Record<string, string>
  /** Append stdout and stderr here; omitted = discarded. */
  logFile?: string
}

export interface ExitInfo {
  code: number | null
  signal: NodeJS.Signals | null
}

export type Spawn = (cmd: string, args: string[], opts: Parameters<typeof spawn>[2]) => ChildProcess

export class ToolProcesses {
  private readonly children = new Map<ToolId, ChildProcess>()
  private readonly exits = new Map<ToolId, ExitInfo>()

  constructor(private readonly spawnImpl: Spawn = spawn) {}

  /** Is a server the app started for `id` still alive? */
  has(id: ToolId): boolean {
    return this.children.has(id)
  }

  /** How the last child for `id` ended, if it did. */
  exitOf(id: ToolId): ExitInfo | undefined {
    return this.exits.get(id)
  }

  /** Start the server unless the app already runs one for `id`. */
  start(id: ToolId, s: ManagedStart): void {
    if (this.children.has(id)) return
    this.exits.delete(id)
    let fd: number | undefined
    if (s.logFile) {
      mkdirSync(dirname(s.logFile), { recursive: true })
      fd = openSync(s.logFile, 'a', 0o600)
    }
    try {
      const child = this.spawnImpl(s.cmd, s.args, {
        stdio: ['ignore', fd ?? 'ignore', fd ?? 'ignore'],
        env: { ...process.env, ...s.env },
        windowsHide: true,
      })
      this.children.set(id, child)
      child.once('error', () => undefined)
      child.once('exit', (code, signal) => {
        if (this.children.get(id) === child) this.children.delete(id)
        this.exits.set(id, { code, signal })
      })
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }

  /** SIGTERM, then SIGKILL after `graceMs`. False when the app had not started one. */
  async stop(id: ToolId, graceMs = 5000): Promise<boolean> {
    const child = this.children.get(id)
    if (!child) return false
    const exited = new Promise<void>((r) => {
      if (child.exitCode !== null || child.signalCode !== null) r()
      else child.once('exit', () => r())
    })
    child.kill('SIGTERM')
    const timer = setTimeout(() => child.kill('SIGKILL'), graceMs)
    try {
      await exited
    } finally {
      clearTimeout(timer)
    }
    this.children.delete(id)
    return true
  }

  /** From before-quit (cannot await): ask every server the app started to stop. */
  stopAll(): void {
    for (const child of this.children.values()) child.kill('SIGTERM')
  }
}

/** The app's one registry. */
export const toolProcesses = new ToolProcesses()
