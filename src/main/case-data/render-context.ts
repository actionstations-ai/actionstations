// Case data for one inject render (spec 0448 FR-7, FR-9): finds the manifest, the inject's
// exercise minute and the data files, and resolves the inject's references. Returns undefined
// when the inject holds no reference, so a scenario without case data renders as before.
import type { Inject } from '@shared/schemas'
import { exerciseMinutes } from '@shared/schemas/common'
import { AppError } from '../lib/errors'
import { getScenario } from '../scenario/store'
import { hasCaseRefs, resolveInjectFields, type ResolvedFields } from './resolve'
import { caseFilePath, readDatasetFile, readManifest } from './store'

export async function resolveCaseForInject(
  root: string,
  scenarioId: string,
  inject: Pick<Inject, 'fields' | 'mselRowId' | 'id'>,
): Promise<ResolvedFields | undefined> {
  if (!hasCaseRefs(inject.fields)) return undefined
  const manifest = await readManifest(root, scenarioId)
  if (!manifest)
    throw new AppError(
      'VALIDATION',
      `Inject ${inject.id} uses case data, but this scenario has none`,
    )
  const scenario = await getScenario(root, scenarioId)
  const row = scenario.msel.find((r) => r.id === inject.mselRowId)
  return resolveInjectFields(inject.fields, {
    manifest,
    readData: (dataset) => readDatasetFile(root, scenarioId, dataset),
    framePath: (file) => caseFilePath(root, scenarioId, file),
    exerciseMin: row ? exerciseMinutes(row.time) : undefined,
  })
}
