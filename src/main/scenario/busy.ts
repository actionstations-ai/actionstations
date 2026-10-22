// Scenarios owned by a generation job (#90). The pipeline checkpoints the whole scenario after
// every step, so while a job owns a scenario a second job or an editor save would be lost
// (last checkpoint wins). Both are rejected with CONFLICT instead.
import { resolve } from 'node:path'
import { AppError } from '../lib/errors'

const owners = new Map<string, string>()

const keyOf = (root: string, scenarioId: string): string => `${resolve(root)}::${scenarioId}`

export const BUSY_MESSAGE = 'Generation is running for this scenario'

/** Claim the scenario for `owner` (a job id). Throws CONFLICT when another owner holds it. */
export function claimScenario(root: string, scenarioId: string, owner: string): () => void {
  const key = keyOf(root, scenarioId)
  const holder = owners.get(key)
  if (holder && holder !== owner) {
    throw new AppError('CONFLICT', `${BUSY_MESSAGE}; wait for it to finish or cancel it first`)
  }
  owners.set(key, owner)
  return () => {
    if (owners.get(key) === owner) owners.delete(key)
  }
}

/** User writes (editor saves, history restore, delete) fail while a job owns the scenario. */
export function assertNotGenerating(root: string, scenarioId: string): void {
  if (owners.has(keyOf(root, scenarioId))) {
    throw new AppError(
      'CONFLICT',
      `${BUSY_MESSAGE}; your change was not saved. Wait for it to finish or cancel it.`,
    )
  }
}
