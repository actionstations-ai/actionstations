// Run a system speech command without a shell: argv array, fixed env, timeout and abort.
// Tests replace this with a stub (contract.test.ts); nothing here ever builds a command string.
import { spawn } from 'node:child_process'
import { AppError } from '../../../lib/errors'

export interface RunOptions {
  env?: Record<string, string>
  timeoutMs: number
  signal?: AbortSignal | undefined
}

export interface RunResult {
  code: number | null
  stdout: string
  stderr: string
}

export type Runner = (command: string, args: string[], opts: RunOptions) => Promise<RunResult>

/** Output kept from each stream; speech engines print little, voice lists a few KB. */
const MAX_OUTPUT = 256 * 1024

export const runCommand: Runner = (command, args, opts) =>
  new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new AppError('CANCELLED', 'Cancelled'))
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...opts.env },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString('utf8')
    })
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString('utf8')
    })
    let failure: AppError | undefined
    const stop = (err: AppError) => {
      failure = err
      child.kill()
    }
    const timer = setTimeout(
      () => stop(new AppError('PROVIDER', `${command} timed out after ${opts.timeoutMs} ms`)),
      opts.timeoutMs,
    )
    const onAbort = () => stop(new AppError('CANCELLED', 'Cancelled'))
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    const done = () => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
    }
    child.on('error', (err) => {
      done()
      reject(new AppError('PROVIDER', `Could not start ${command}: ${err.message}`))
    })
    child.on('close', (code) => {
      done()
      if (failure) reject(failure)
      else resolve({ code, stdout, stderr })
    })
  })
