// Facility facts editor (#155) in the built app: NCIA project → Facility facts (from the
// project nav) → add Runway 9/27 → Save → facility-facts.md on disk has it and a row naming
// Runway 9 no longer gets FACILITY_UNKNOWN_ID; remove Gate 24 → its row gets the warning;
// Reset → back to the extracted facts. Screenshots (light, dark) go to .tmp/facts-editor/.
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from './helpers'

test.setTimeout(180_000)

const OUT = resolve('.tmp/facts-editor')
const NCIA = [
  'reference/ncia/terminal-incident-response-plan-TIRP.md',
  'reference/ncia/airport-emergency-plan-AEP.md',
  'reference/ncia/terminal-map.md',
].map((f) => resolve(f))
const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

type Invoke = ReturnType<typeof invoker>
interface Warning {
  code: string
  rowId?: string
}

const row = (id: string, event: string) => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'Ramp Supervisor',
  toRoleIds: [],
  event,
  expectedAction: 'Coordinate with Airport Operations.',
  purposeTag: 'CORE_NARRATIVE',
  citations: [],
  locked: false,
})

async function seed(invoke: Invoke): Promise<{ projectPath: string; scenarioId: string }> {
  const { path: projectPath } = await invoke<{ path: string }>('project:create', {
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-facts-')),
    name: 'North Coast International Airport',
    orgType: 'airport',
  })
  const { jobId } = await invoke<{ jobId: string }>('documents:import', {
    projectPath,
    filePaths: NCIA,
  })
  await expect
    .poll(async () => (await invoke<{ status: string }>('jobs:get', { jobId })).status, {
      timeout: 60_000,
    })
    .toBe('done')
  const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
    projectPath,
    title: 'Airfield lights',
  })
  await invoke('scenarios:save', {
    projectPath,
    scenario: {
      ...FIXTURE,
      id: empty.id,
      projectId: empty.projectId,
      msel: [
        row('I-01', 'Approach lights on Runway 9 begin cycling without a command.'),
        row('I-02', 'The jet bridge at Gate 24 stops mid-travel with passengers aboard.'),
      ],
    },
  })
  return { projectPath, scenarioId: empty.id }
}

async function flaggedRows(invoke: Invoke, projectPath: string, scenarioId: string) {
  const lint = await invoke<Warning[]>('scenarios:lint', { projectPath, scenarioId })
  return lint.filter((w) => w.code === 'FACILITY_UNKNOWN_ID').map((w) => w.rowId)
}

const factsFile = (projectPath: string) =>
  readFileSync(join(projectPath, 'facility-facts.md'), 'utf8')

async function shoot(page: Page, name: string) {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(OUT, `${theme}-${name}.png`), fullPage: true })
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
}

test('facility facts: edit in the app → file on disk → lint follows; reset', async () => {
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch()
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  try {
    const { projectPath, scenarioId } = await seed(invoke)
    expect(await flaggedRows(invoke, projectPath, scenarioId)).toEqual(['I-01'])

    // Discoverable from the project nav.
    await goTo(page, `#/p/${encodeURIComponent(projectPath)}`)
    await page.getByRole('link', { name: 'Facility facts' }).click()
    const runways = page.getByRole('region', { name: 'Runways' })
    await expect(runways.getByRole('textbox', { name: 'Runways entry 1' })).toHaveValue('5/23')
    await expect(runways.getByText(/Found in .*Airport Emergency Plan/).first()).toBeVisible()
    await expect(page.getByText('1 unknown-identifier warning across 1 scenario.')).toBeVisible()
    await shoot(page, 'loaded')

    // Add Runway 9/27 from the keyboard and save with Ctrl+S.
    await runways.getByRole('textbox', { name: 'Add to Runways' }).fill('9/27')
    await page.keyboard.press('Enter')
    await expect(runways.getByText('Added by you')).toBeVisible()
    await page.keyboard.press('Control+s')
    await expect(page.getByText('Edited by you')).toBeVisible()
    expect(factsFile(projectPath)).toContain('- 9/27')
    await expect(
      page.getByText(/0 unknown-identifier warnings across 1 scenario \(1 fewer/),
    ).toBeVisible()
    expect(await flaggedRows(invoke, projectPath, scenarioId)).toEqual([])
    await shoot(page, 'saved')

    // Remove Gate 24: the row that names it is flagged now.
    const gates = page.getByRole('region', { name: 'Gates' })
    await gates.getByRole('button', { name: 'Remove 24 from Gates' }).click()
    await expect(gates.getByRole('button', { name: 'Restore 24 to Gates' })).toBeVisible()
    await page.getByRole('button', { name: /^Save/ }).click()
    await expect(page.getByText(/1 unknown-identifier warning across 1 scenario/)).toBeVisible()
    expect(factsFile(projectPath)).not.toMatch(/^- 24$/m)
    expect(await flaggedRows(invoke, projectPath, scenarioId)).toEqual(['I-02'])

    // Reset to the extracted facts (confirm dialog), then the file is the extraction again.
    await page.getByRole('button', { name: /Reset to extracted facts/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Reset to the extracted facts?' })
    await shoot(page, 'reset-dialog')
    await dialog.getByRole('button', { name: 'Reset' }).click()
    await expect(page.getByText('Matches the documents')).toBeVisible()
    const md = factsFile(projectPath)
    expect(md).not.toContain('- 9/27')
    expect(md).toMatch(/^- 24$/m)
    expect(await flaggedRows(invoke, projectPath, scenarioId)).toEqual(['I-01'])
    await expect(page.getByText(/3 earlier versions kept/)).toBeVisible()
  } finally {
    await app.close()
  }
})
