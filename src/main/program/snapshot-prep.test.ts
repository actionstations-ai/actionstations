// The program snapshot keeps the facts of a PREP exercise for the program's cycle view (#782).
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { on: vi.fn(), getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}))

const { createProject } = await import('../project/store')
const { createScenario, getScenario, saveScenario, saveInject } = await import('../scenario/store')
const { ScenarioBrief, Inject } = await import('@shared/schemas')
const { PrepSettings } = await import('@shared/prep')
const { snapshotProject } = await import('./snapshot')

async function projectWith(prep: Record<string, unknown> | undefined) {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-snap-'))
  const { path } = await createProject({ parentDir: parent, name: 'Org', orgType: 'generic' })
  const created = await createScenario(path, {
    title: 'Annual IMT tabletop',
    brief: ScenarioBrief.parse({ userPrompt: 'A release.' }),
  })
  const scenario = await getScenario(path, created.id)
  await saveScenario(
    path,
    {
      ...scenario,
      conduct: {
        ...(scenario.conduct ?? {}),
        dates: ['2026-03-10'],
        ...(prep ? { prep: PrepSettings.parse(prep) } : {}),
      } as never,
    },
    { by: 'user' },
  )
  await saveInject(
    path,
    created.id,
    Inject.parse({ id: 'inj-0', mselRowId: 'I-00', type: 'nrc_report_record', title: 'NRC' }),
    { by: 'user', snapshot: false },
  )
  return path
}

describe('snapshotProject PREP facts', () => {
  it('records the plan, the date and the components the injects reach', async () => {
    const root = await projectWith({
      exerciseKind: 'imt_tabletop',
      planType: 'pipeline',
      planHolder: 'Harlan Spur Pipeline Company',
      cycleStart: '2026-01-01',
      worstCaseDischarge: true,
    })
    const snap = await snapshotProject(root)
    const prep = snap.scenarios[0]!.prep!
    expect(prep.planType).toBe('pipeline')
    expect(prep.date).toBe('2026-03-10')
    expect(prep.cycleStart).toBe('2026-01-01')
    expect(prep.worstCaseDischarge).toBe(true)
    expect(prep.components).toContain('notifications')
  })

  it('leaves a scenario that is not a PREP exercise without PREP facts', async () => {
    const snap = await snapshotProject(await projectWith(undefined))
    expect(snap.scenarios[0]!.prep).toBeUndefined()
  })
})
