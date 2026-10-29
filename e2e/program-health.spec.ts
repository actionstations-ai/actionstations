// Program health dashboard (#438): a program with one linked project that has been exercised and
// one corrective action. Open Health, filter by project (the choice lands in the URL), export the
// PDF and the CSV ZIP, then run axe on the screen in light and dark.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { goTo, invoker, launch } from './helpers'

const NOW = '2026-04-01T10:00:00.000Z'

test('program health: filter, export PDF and CSV, axe in light and dark', async () => {
  test.setTimeout(180_000)
  const parent = mkdtempSync(join(tmpdir(), 'ttx-e2e-health-'))
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  try {
    const invoke = invoker(page)
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir: parent,
      name: 'Airport Health E2E',
    })
    const scenario = await invoke<{ id: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioDir = join(projectPath, 'scenarios', scenario.id)
    mkdirSync(scenarioDir, { recursive: true })
    writeFileSync(
      join(scenarioDir, 'facilitator.json'),
      JSON.stringify({
        delivered: { 'I-01': { at: '2026-03-01T09:00:00.000Z', exerciseTime: '0:30' } },
      }),
    )
    const { path: programPath } = await invoke<{ path: string }>('program:create', {
      parentDir: parent,
      name: 'Health Program',
      startYear: 2026,
    })
    await invoke('program:link-project', { programPath, projectPath })
    await invoke('program:refresh', { programPath })
    await invoke('program:action-save', {
      programPath,
      action: {
        id: 'health-1',
        programId: 'x',
        title: 'Write the vendor access procedure',
        coreCapabilities: ['operational_coordination'],
        source: { kind: 'manual' },
        createdAt: NOW,
        updatedAt: NOW,
        dueDate: '2026-06-30',
      },
    })

    await goTo(page, '#/program/health')
    await expect(page.getByRole('heading', { name: 'Program health' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Core Capabilities by quarter' })).toBeVisible()
    await expect(
      page.getByText('Airport Health E2E (2026-', { exact: false }).first(),
    ).toBeVisible()

    // Filter by project: the choice is in the URL, and the report still shows the project.
    await page.getByLabel('Project').selectOption({ label: 'Airport Health E2E' })
    await expect.poll(() => page.url()).toContain('project=')
    await expect(page.getByRole('heading', { name: 'Timeline' })).toBeVisible()

    // PDF and the CSV ZIP exist and carry the program's own data.
    const out = join(parent, 'out')
    const { files } = await invoke<{ files: string[] }>('program:export', {
      programPath,
      outDir: out,
      targets: ['health_pdf', 'health_csv'],
    })
    expect(files).toHaveLength(2)
    expect(
      readFileSync(files.find((f) => f.endsWith('.pdf'))!)
        .subarray(0, 4)
        .toString(),
    ).toBe('%PDF')
    expect(
      readFileSync(files.find((f) => f.endsWith('.zip'))!)
        .subarray(0, 2)
        .toString(),
    ).toBe('PK')

    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await goTo(page, '#/program/health')
      await expect(
        page.getByRole('heading', { name: 'Core Capabilities by quarter' }),
      ).toBeVisible()
      const result = await new AxeBuilder({ page })
        .setLegacyMode(true)
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze()
      expect(result.violations.map((v) => `${scheme}: ${v.id} (${v.nodes.length})`)).toEqual([])
    }
  } finally {
    await app.close()
  }
})
