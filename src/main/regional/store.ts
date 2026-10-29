// scenarios/<id>/regional.json: this scenario's part in a regional exercise (spec 0440).
import { RegionalState } from '@shared/schemas/regional'
import { AppError } from '../lib/errors'
import { exists, readJson, safeJoin, writeJsonAtomic } from '../lib/fs'
import { scenarioLayout } from '../scenario/layout'

const file = (root: string, scenarioId: string): string =>
  safeJoin(scenarioLayout(root, scenarioId).dir, 'regional.json')

export async function hasRegional(root: string, scenarioId: string): Promise<boolean> {
  return exists(file(root, scenarioId))
}

export async function readRegional(root: string, scenarioId: string): Promise<RegionalState> {
  if (!(await hasRegional(root, scenarioId)))
    throw new AppError('NOT_FOUND', 'This scenario is not part of a regional exercise.')
  return readJson(file(root, scenarioId), RegionalState)
}

export async function writeRegional(
  root: string,
  scenarioId: string,
  state: RegionalState,
): Promise<RegionalState> {
  const parsed = RegionalState.parse(state)
  await writeJsonAtomic(file(root, scenarioId), parsed)
  return parsed
}
