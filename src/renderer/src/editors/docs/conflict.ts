import { IpcError } from '../../lib/api'

/** The store refused a write because a generation job owns the scenario. */
export const isConflict = (e: unknown): boolean => e instanceof IpcError && e.code === 'CONFLICT'
