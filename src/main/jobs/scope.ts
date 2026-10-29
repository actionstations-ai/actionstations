// The job, or the IPC request, a piece of async work belongs to (#433). JobManager runs each job
// inside a scope and the IPC dispatcher runs each handler taking a projectPath inside one, so code
// far from the caller (the outbound gate around an embedding or media provider) can tell which job
// and project a request serves without every caller passing it along.
import { AsyncLocalStorage } from 'node:async_hooks'

export interface JobScope {
  /** Absent for an IPC request outside a job (a search on the Search page). */
  jobId?: string
  /** As given by the caller; the gate uses it only for a project the user opened. */
  projectPath?: string
  signal?: AbortSignal
}

const storage = new AsyncLocalStorage<JobScope>()

export function runInJobScope<T>(scope: JobScope, fn: () => T): T {
  return storage.run(scope, fn)
}

/** The running job, when called from inside one. */
export function currentJob(): JobScope | undefined {
  return storage.getStore()
}
