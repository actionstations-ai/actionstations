// Screenshot tour of every screen with a realistic project (NCIA documents, a provider,
// a scenario). Opt-in: TOUR=1 pnpm exec playwright test e2e/tour.spec.ts
// Optional: TOUR_SCENARIO_DIR=<dir with scenario.json, ideas.json, handbook.md, briefing.md,
// hotwash.md> to show a generated scenario; defaults to the Scenario 3 fixture.
import { expect, test, type Page } from '@playwright/test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

test.skip(!process.env.TOUR, 'Screenshot tour runs only with TOUR=1')
test.setTimeout(180_000)

const OUT = resolve('test-results/tour')
const sourceDir = process.env.TOUR_SCENARIO_DIR ? resolve(process.env.TOUR_SCENARIO_DIR) : undefined
const mdFiles = (dir: string) =>
  readdirSync(resolve(dir))
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(resolve(dir), f))

async function goTo(page: Page, hash: string) {
  await page.evaluate((h) => {
    ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
  }, hash)
  await page.waitForTimeout(600)
}

let shot = 0
async function snap(page: Page, theme: string, name: string, fullPage = false) {
  shot += 1
  await page.screenshot({
    path: join(OUT, `${theme}-${String(shot).padStart(2, '0')}-${name}.png`),
    fullPage,
  })
}

test('tour: every screen with a populated NCIA project', async () => {
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch()
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-tour-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'North Coast International Airport',
      orgName: 'North Coast Regional Airport Authority',
      orgType: 'airport',
    })
    await invoke('project:update', {
      path: projectPath,
      patch: {
        brand: { city: 'Akron', region: 'Summit County, Ohio', aliases: { localTv: 'Channel 5' } },
      },
    })
    const docs = [...mdFiles('reference/ncia'), ...mdFiles('reference/ics-forms')]
    await invoke('documents:import', { projectPath, filePaths: docs })
    await expect
      .poll(
        async () =>
          (await invoke<{ status: string }[]>('documents:list', { projectPath })).every(
            (d) => d.status === 'ok',
          ),
        {
          timeout: 60_000,
        },
      )
      .toBe(true)

    // A real local provider (LM Studio) routed for text tasks, if it is running.
    const lm = await invoke<{ id: string }>('providers:upsert', {
      config: {
        kind: 'openai-compatible',
        label: 'LM Studio',
        baseUrl: 'http://127.0.0.1:1234/v1',
        defaultModel: 'qwen3-30b-a3b-2507',
        options: {},
        enabled: true,
      },
    })
    await invoke('routing:set', {
      scope: 'global',
      routing: {
        ideate: { providerId: lm.id },
        draft: { providerId: lm.id },
        critique: { providerId: lm.id },
      },
    })

    // Scenario: generated sample if provided, else the Scenario 3 fixture.
    const scenarioJson = sourceDir
      ? join(sourceDir, 'scenario.json')
      : resolve('tests/fixtures/scenarios/scenario-3.json')
    const scenario = JSON.parse(readFileSync(scenarioJson, 'utf8')) as Record<string, unknown>
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: String(scenario.title),
    })
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...scenario, id: empty.id, projectId: empty.projectId, documents: {} },
    })
    for (const kind of ['handbook', 'briefing', 'hotwash'] as const) {
      const f = sourceDir && join(sourceDir, `${kind}.md`)
      if (f && existsSync(f)) {
        await invoke('scenarios:doc-save', {
          projectPath,
          scenarioId: empty.id,
          kind,
          markdown: readFileSync(f, 'utf8'),
        })
      }
    }
    if (sourceDir && existsSync(join(sourceDir, 'ideas.json'))) {
      writeFileSync(join(projectPath, 'ideas.json'), readFileSync(join(sourceDir, 'ideas.json')))
    }

    const key = encodeURIComponent(projectPath)
    for (const theme of ['light', 'dark'] as const) {
      await invoke('settings:update', { ui: { theme } })
      await page.reload()
      await page.waitForLoadState('domcontentloaded')
      await goTo(page, '#/projects')
      await snap(page, theme, 'projects')
      await goTo(page, `#/p/${key}`)
      await snap(page, theme, 'project-overview')
      await goTo(page, `#/p/${key}/documents`)
      await snap(page, theme, 'documents')
      await goTo(page, `#/p/${key}/scenarios/${empty.id}`)
      await page.getByRole('tab', { name: /^MSEL/ }).click()
      await page.waitForTimeout(300)
      await snap(page, theme, 'scenario-msel')
      if (theme === 'dark') break

      await goTo(page, `#/p/${key}/search`)
      await page.getByLabel(/query/i).first().fill('FIDS failure')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(800)
      await snap(page, theme, 'search')
      await goTo(page, `#/p/${key}/generate`)
      await snap(page, theme, 'generate-from-prompt')
      await page.getByRole('tab', { name: /Give me ideas/ }).click()
      await page.waitForTimeout(500)
      await snap(page, theme, 'generate-ideas')
      await goTo(page, `#/p/${key}/scenarios`)
      await snap(page, theme, 'scenarios')
      await goTo(page, `#/p/${key}/scenarios/${empty.id}`)
      for (const tab of [/^Overview/, /^Objectives/, /^Documents/, /^Rubric/, /^Warnings/]) {
        const t = page.getByRole('tab', { name: tab })
        if ((await t.count()) === 0) continue
        await t.click()
        await page.waitForTimeout(300)
        await snap(
          page,
          theme,
          `scenario-${String(tab)
            .replace(/[^a-z]/gi, '')
            .toLowerCase()}`,
        )
      }
      await goTo(page, '#/prompts')
      await snap(page, theme, 'prompts')
      await goTo(page, '#/providers')
      await page.waitForTimeout(1500)
      await snap(page, theme, 'providers')
      await goTo(page, '#/settings')
      await snap(page, theme, 'settings')
    }
  } finally {
    await app.close()
  }
})
