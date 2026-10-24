// Run an OS tool (codesign, spctl, hdiutil, ditto, PowerShell, lms, nvidia-smi) without a
// shell: arguments are passed as an array, so nothing in them is ever interpreted. Injected
// into the setup modules so tests can stand in for the OS.
import { execFile, spawn } from 'node:child_process'

export interface RunResult {
  code: number
  stdout: string
  stderr: string
}

export interface RunOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** Called with each chunk of stdout and stderr (progress parsing). */
  onOutput?: (text: string) => void
  /** Extra environment variables (how a file path reaches a PowerShell script safely). */
  env?: Record<string, string>
}

export type Runner = (cmd: string, args: string[], opts?: RunOptions) => Promise<RunResult>

const MAX_BUFFER = 8 * 1024 * 1024

/** Run to completion; a non-zero exit is a result, not an error. ENOENT rejects. */
export const runCommand: Runner = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    if (opts.onOutput) {
      const child = spawn(cmd, args, {
        windowsHide: true,
        ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
        ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => {
        const t = d.toString()
        stdout = (stdout + t).slice(-MAX_BUFFER)
        opts.onOutput?.(t)
      })
      child.stderr.on('data', (d: Buffer) => {
        const t = d.toString()
        stderr = (stderr + t).slice(-MAX_BUFFER)
        opts.onOutput?.(t)
      })
      child.on('error', reject)
      child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
      return
    }
    execFile(
      cmd,
      args,
      {
        windowsHide: true,
        maxBuffer: MAX_BUFFER,
        ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
        ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { code?: unknown }) | null
        if (e && (typeof e.code === 'string' || e.name === 'AbortError')) {
          reject(e)
          return
        }
        resolve({ code: e ? Number(e.code ?? 1) || 1 : 0, stdout, stderr })
      },
    )
  })

/** Start a long-running program detached from the app (a local server); returns at once. */
export type Launcher = (cmd: string, args: string[]) => void

export const launchDetached: Launcher = (cmd, args) => {
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', () => undefined)
  child.unref()
}
