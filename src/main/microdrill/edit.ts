// Saving an edited micro-drill (#437, FR-5, FR-6): the build checks run again on every save, the
// annex cannot be changed (build a new drill instead), and a drill with open problems becomes
// Ready only when the user chose to override them.
import { MicroDrill } from '@shared/schemas'
import { AppError } from '../lib/errors'
import { openChunks, readAnnex } from './annex'
import { lintDrill } from './lint'
import { getMicroDrill, saveMicroDrill } from './store'

async function lintAgainstPlan(root: string, drill: MicroDrill): Promise<MicroDrill['lint']> {
  try {
    const index = await openChunks(root)
    const annex = readAnnex(index, drill.annex.documentId, drill.annex.headingPath)
    return lintDrill(drill, annex.chunks)
  } catch (err) {
    return [
      {
        code: 'annex_missing',
        message: `The plan section could not be read, so citations were not checked: ${(err as Error).message}`,
      },
    ]
  }
}

export async function saveEditedDrill(root: string, input: MicroDrill): Promise<MicroDrill> {
  const current = await getMicroDrill(root, input.id)
  const next = MicroDrill.parse({
    ...input,
    annex: current.annex,
    createdAt: current.createdAt,
    version: current.version + 1,
  })
  const lint = await lintAgainstPlan(root, next)
  const overridden = next.lintOverridden && lint.length > 0
  if (next.status === 'ready' && lint.length && !overridden)
    throw new AppError(
      'VALIDATION',
      'This drill has problems. Fix them, or choose to mark it Ready anyway.',
    )
  return saveMicroDrill(root, { ...next, lint, lintOverridden: overridden })
}
