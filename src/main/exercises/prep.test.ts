// PREP coverage across a project's exercises (#782), against a real project folder.
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
const { prepCoverage } = await import('./prep')

async function setup() {
  process.env.TTX_USER_DATA = mkdtempSync(join(tmpdir(), 'ttx-ud-'))
  const parent = mkdtempSync(join(tmpdir(), 'ttx-prep-'))
  const { path } = await createProject({ parentDir: parent, name: 'Org', orgType: 'generic' })
  return path
}

async function exercise(
  root: string,
  title: string,
  date: string,
  prep: Record<string, unknown>,
  injectTypes: string[] = [],
) {
  const created = await createScenario(root, {
    title,
    brief: ScenarioBrief.parse({ userPrompt: 'A release.' }),
  })
  const scenario = await getScenario(root, created.id)
  await saveScenario(
    root,
    {
      ...scenario,
      conduct: {
        ...(scenario.conduct ?? {}),
        dates: [date],
        prep: PrepSettings.parse({ exerciseKind: 'imt_tabletop', planType: 'pipeline', ...prep }),
      } as never,
    },
    { by: 'user' },
  )
  for (const [i, type] of injectTypes.entries())
    await saveInject(
      root,
      created.id,
      Inject.parse({ id: `inj-${i}`, mselRowId: `I-0${i}`, type, title: type }),
      { by: 'user', snapshot: false },
    )
  return created.id
}

describe('prepCoverage', () => {
  it('counts the components the injects and the discussion reach, inside the cycle only', async () => {
    const root = await setup()
    const cycle = { cycleStart: '2025-01-01' }
    const first = await exercise(root, 'Year one', '2025-06-01', cycle, [
      'nrc_report_record',
      'countermeasure_request',
    ])
    await exercise(root, 'Year two', '2026-06-01', { ...cycle, alsoExercised: ['disposal'] })
    await exercise(root, 'Last cycle', '2024-06-01', { cycleStart: '2022-01-01' }, [
      'closure_order',
    ])
    const cov = await prepCoverage(root, first)
    expect(cov.cycleLine).toBe('Year 1 of the 3-year cycle that began 2025-01-01 (ends 2027-12-31)')
    expect(cov.exercises.map((e) => e.title).sort()).toEqual(['Year one', 'Year two'])
    // notifications, communications (NRC record), mitigation, disposal (discussion)
    expect(cov.covered).toBe(4)
    expect(cov.applicable).toBe(15)
    expect(cov.missing).toContain('protection')
    expect(cov.missing).not.toContain('disposal')
  })

  it('leaves out components the plan holder marked as not applicable', async () => {
    const root = await setup()
    const id = await exercise(root, 'One', '2025-06-01', {
      cycleStart: '2025-01-01',
      notApplicable: ['source_control', 'transportation'],
    })
    const cov = await prepCoverage(root, id)
    expect(cov.applicable).toBe(13)
    expect(cov.missing).not.toContain('source_control')
  })

  it('refuses a scenario that is not a PREP exercise', async () => {
    const root = await setup()
    const created = await createScenario(root, {
      title: 'Plain',
      brief: ScenarioBrief.parse({ userPrompt: 'x' }),
    })
    await expect(prepCoverage(root, created.id)).rejects.toThrow(/not set up as a PREP/)
  })
})
