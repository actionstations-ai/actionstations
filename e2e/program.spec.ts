// Exercise program (#424): create a program, link a project, import the after-action report's
// corrective actions through the review page, change a status, write the CSV, then relaunch and
// find the program open again. A second app with its own settings folder reads the same program
// folder and shows the "Also open by" notice. The folder pickers are native dialogs, so the
// folder is chosen through the IPC channel; everything after that is driven through the screens.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { goTo, invoker, launch } from './helpers'

const NOW = '2026-04-01T10:00:00.000Z'

const AAR = {
  formatVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  exerciseDate: '2026-03-12',
  capabilities: [
    {
      capability: 'public_information_and_warning',
      areasForImprovement: [
        {
          id: 'F1',
          title: 'PIO approval chain is unclear',
          analysisMd: 'Players did not know who approves a public release.',
          evidence: ['note:general'],
          correctiveActions: [
            {
              id: 'A1',
              action: 'Add a PIO approval chain to the emergency plan.',
              element: 'planning',
              ownerOrganization: 'Airport PIO',
              poc: 'J. Ruiz',
              dueDate: '2026-06-30',
            },
          ],
        },
      ],
    },
  ],
}

test('exercise program: create, link, import, change status, export, relaunch, lock notice', async () => {
  test.setTimeout(180_000)
  const parent = mkdtempSync(join(tmpdir(), 'ttx-e2e-program-'))
  const first = await launch({ TTX_MOCK_PROVIDERS: '1' })
  try {
    const invoke = invoker(first.page)
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir: parent,
      name: 'Airport Program E2E',
    })
    const scenario = await invoke<{ id: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioDir = join(projectPath, 'scenarios', scenario.id)
    mkdirSync(scenarioDir, { recursive: true })
    writeFileSync(join(scenarioDir, 'aar.json'), JSON.stringify(AAR))

    const created = await invoke<{ path: string }>('program:create', {
      parentDir: parent,
      name: 'County Exercise Program',
      startYear: 2026,
    })
    const programPath = created.path
    await invoke('program:link-project', { programPath, projectPath })

    await goTo(first.page, '#/program')
    await expect(first.page.getByRole('heading', { name: 'Exercise program' })).toBeVisible()
    await expect(first.page.getByText('Airport Program E2E')).toBeVisible()

    // Import review, then the corrective actions table.
    await goTo(first.page, `#/program/import/${encodeURIComponent(projectPath)}/${scenario.id}`)
    await expect(first.page.getByRole('textbox', { name: 'Corrective action' })).toHaveValue(
      /Add a PIO approval chain/,
    )
    await first.page.getByRole('button', { name: 'Import 1 action' }).click()
    await expect(first.page.getByRole('table')).toBeVisible()
    const row = first.page.getByRole('row', { name: /Add a PIO approval chain/ })
    await expect(row).toContainText('Public Information and Warning')
    await expect(row).toContainText('Open')

    // Change the status from the editor.
    await row.getByRole('button', { name: /Add a PIO approval chain/ }).click()
    await first.page.getByRole('button', { name: 'Change status…' }).click()
    await first.page.getByLabel('New status').selectOption('in_progress')
    await first.page.getByRole('button', { name: 'Save status' }).click()
    await expect(
      first.page.getByRole('dialog').locator('.badge', { hasText: 'In progress' }),
    ).toBeVisible()
    await first.page.getByRole('button', { name: 'Close' }).first().click()
    await expect(row).toContainText('In progress')

    // CSV in the HSEEP improvement plan layout.
    const out = join(parent, 'out')
    const { files } = await invoke<{ files: string[] }>('program:export', {
      programPath,
      outDir: out,
      targets: ['ip_csv'],
    })
    const csv = readFileSync(files[0]!, 'utf8')
    expect(csv.split('\r\n')[0]).toContain('Primary Responsible Organization')
    expect(csv).toContain('Airport PIO')
    expect(readdirSync(out)).toHaveLength(1)

    // A second app with its own settings folder sees the same program and the lock notice.
    const second = await launch({ TTX_MOCK_PROVIDERS: '1' })
    try {
      const other = await invoker(second.page)<{ lock?: { host: string } }>('program:open', {
        programPath,
      })
      expect(other.lock?.host).toBeTruthy()
    } finally {
      await second.app.close()
    }
  } finally {
    await first.app.close()
  }

  // Relaunch with the same settings folder: the program is open again.
  const again = await launch({ TTX_MOCK_PROVIDERS: '1' }, { userData: first.userData })
  try {
    await goTo(again.page, '#/program')
    await expect(again.page.getByText('County Exercise Program').first()).toBeVisible()
    await goTo(again.page, '#/program/actions')
    await expect(again.page.getByRole('button', { name: /Add a PIO approval chain/ })).toBeVisible()
  } finally {
    await again.app.close()
  }
})

test('exercise program screens pass an axe check in light and dark', async () => {
  test.setTimeout(120_000)
  const parent = mkdtempSync(join(tmpdir(), 'ttx-e2e-program-a11y-'))
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  try {
    const invoke = invoker(page)
    const { path: programPath } = await invoke<{ path: string }>('program:create', {
      parentDir: parent,
      name: 'Accessibility Program',
      startYear: 2026,
    })
    await invoke('program:action-save', {
      programPath,
      action: {
        id: 'a11y-1',
        programId: 'x',
        title: 'Write the vendor access procedure',
        source: { kind: 'manual' },
        createdAt: NOW,
        updatedAt: NOW,
        dueDate: '2026-06-30',
      },
    })
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      for (const route of ['#/program', '#/program/actions', '#/program/schedule']) {
        await goTo(page, route)
        await expect(page.getByRole('navigation', { name: 'Program sections' })).toBeVisible()
        const result = await new AxeBuilder({ page })
          .setLegacyMode(true)
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze()
        expect(
          result.violations.map((v) => `${scheme} ${route}: ${v.id} (${v.nodes.length})`),
        ).toEqual([])
      }
    }
  } finally {
    await app.close()
  }
})
