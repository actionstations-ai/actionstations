// The job a piece of async work belongs to (#433). JobManager runs each job inside this scope,
// so code far from the job (the outbound gate around an embedding or media provider) can tell
// which job and project a request serves without every caller passing it along.
import { AsyncLocalStorage } from 'node:async_hooks'

export interface JobScope {
  jobId: string
  projectPath?: string
  signal: AbortSignal
}

const storage = new AsyncLocalStorage<JobScope>()

export function runInJobScope<T>(scope: JobScope, fn: () => T): T {
  return storage.run(scope, fn)
}

/** The running job, when called from inside one. */
export function currentJob(): JobScope | undefined {
  return storage.getStore()
}
