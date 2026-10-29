// Regulatory clocks and the compliance coverage export (#426). An airport project has CIRCIA on
// by default; the MSEL editor makes I-03 start the CIRCIA clock; delivering I-03 in Facilitate
// starts it with the right scenario-time deadline; marking it filed shows "Met"; the coverage
// workbook has the framework sheet and a Clocks sheet with the result.
import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch, openProjectSettings, waitForJob } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as { brief: Record<string, unknown> } & Record<string, unknown>

test('regulatory clocks: start from an inject, file, export the coverage matrix', async () => {
  test.setTimeout(120_000)
  const { app, page } = await launch()
  const invoke = invoker(page)
  try {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 900),
    )
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-clocks-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Clocks',
      orgType: 'airport',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioId = empty.id
    await invoke('scenarios:save', {
      projectPath,
      scenario: {
        ...FIXTURE,
        id: scenarioId,
        projectId: empty.projectId,
        brief: { ...FIXTURE.brief, startDate: '2026-03-12', startWallClock: '09:00' },
      },
    })
    const key = encodeURIComponent(projectPath)

    // Settings › Compliance: CIRCIA is on for an airport and labelled as a proposed rule.
    await goTo(page, `#/p/${key}`)
    await openProjectSettings(page)
    const compliance = page.getByRole('region', { name: 'Compliance' })
    await expect(compliance.getByRole('checkbox', { name: 'CIRCIA' })).toBeChecked()
    await expect(compliance.getByText(/come from a proposed rule/)).toBeVisible()

    // MSEL editor: I-03 starts the CIRCIA covered-incident clock.
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}`)
    await page.getByRole('tab', { name: 'MSEL (24)' }).click()
    // Keyboard, as a grid user would: the row actions button sits under the sticky scroller.
    await page.getByRole('button', { name: 'Actions for I-03' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('menuitem', { name: 'Starts reporting clocks…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Reporting clocks started by I-03' })
    await dialog
      .getByRole('checkbox', { name: 'Reasonably believes a covered cyber incident occurred' })
      .check()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('All changes saved')).toBeVisible({ timeout: 10_000 })

    // Facilitate: deliver I-03 at 0:20 → the CIRCIA 72 h clock runs to Sun 15 Mar 09:20.
    await goTo(page, `#/p/${key}/scenarios/${scenarioId}/facilitate`)
    const clocks = page.getByRole('region', { name: 'Regulatory clocks' })
    await expect(clocks.getByText(/No clock running/)).toBeVisible()
    await page.getByLabel('Exercise time (H:MM)').fill('0:20')
    await page.getByRole('button', { name: 'Set time', exact: true }).click()
    const timeline = page.getByRole('region', { name: 'Timeline' })
    const i03 = timeline.locator('.fac-row').filter({ has: page.locator('[data-row-id="I-03"]') })
    await expect(i03).toContainText('Starts a reporting clock')
    await timeline.getByRole('button', { name: 'Deliver I-03', exact: true }).click()
    await expect(page.locator('.fac-status')).toContainText('reporting clock started: CIRCIA')
    const incident = clocks.getByTestId('clock-circia:incident_report')
    await expect(incident).toContainText('Running')
    await expect(incident).toContainText('Due Sun 15 Mar 09:20 · 72 h 0 m left')

    // Mark it filed at 11:05 scenario time.
    await incident.getByRole('button', { name: 'Filed…' }).click()
    await incident.getByLabel('Filed at (scenario time)').fill('11:05')
    await page.keyboard.press('Enter')
    await expect(incident).toContainText('Met')
    await expect(incident).toContainText('filed Thu 12 Mar 11:05')
    await expect(page.locator('.fac-status')).toContainText('Saved')

    // Export the coverage workbook and read it back.
    const outDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-clocks-out-'))
    const { jobId } = await invoke<{ jobId: string }>('export:run', {
      projectPath,
      scenarioId,
      outDir,
      targets: ['coverage_xlsx'],
    })
    const job = await waitForJob(invoke, jobId)
    const folder = (job.result as { folder: string }).folder
    const file = readdirSync(folder).find((f) => f.endsWith('-Compliance-Coverage.xlsx'))
    expect(file).toBeTruthy()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(join(folder, file!))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['NIST CSF 2.0', 'Clocks', 'About'])
    const sheet = wb.getWorksheet('Clocks')!
    const rows = sheet.getSheetValues().slice(2) as unknown[][]
    const circia = rows.find((r) => r?.[4] === 'Covered cyber incident report')!
    expect(circia[2]).toBe('CIRCIA (proposed)')
    expect(circia[7]).toBe('Sun 15 Mar 2026 09:20')
    expect(circia[8]).toBe('Thu 12 Mar 2026 11:05')
    expect(circia[9]).toBe('Met')
  } finally {
    await app.close()
  }
})
