// Facilitator mode (#45): Scenario 3 fixture with template-rendered injects. Starts the clock,
// delivers an image inject (a presentation window opens showing it), adds a hot wash note,
// reloads and checks everything persisted. Screenshots of both windows in light and dark go
// to .tmp/facilitator/ (outside test-results, which Playwright wipes).
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker, launch } from './helpers'

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>
const OUT = resolve('.tmp/facilitator')

interface Inject {
  id: string
  fields: Record<string, unknown>
  [k: string]: unknown
}

const preview = (type: string) =>
  JSON.parse(readFileSync(resolve(`templates/injects/${type}/preview.json`), 'utf8')) as {
    fields: Record<string, unknown>
  }

async function goTo(page: Page, hash: string) {
  await page.evaluate((h) => {
    ;(globalThis as unknown as { location: { hash: string } }).location.hash = h
  }, hash)
}

/** Create an inject for an MSEL row with the template's preview fields and render it. */
async function renderedInject(
  invoke: ReturnType<typeof invoker>,
  projectPath: string,
  scenarioId: string,
  rowId: string,
  type: string,
): Promise<Inject> {
  const created = await invoke<Inject>('injects:create', {
    projectPath,
    scenarioId,
    mselRowId: rowId,
    type,
  })
  await invoke('injects:save', {
    projectPath,
    scenarioId,
    inject: { ...created, fields: preview(type).fields },
  })
  await invoke('render:inject', { projectPath, scenarioId, injectId: created.id })
  return created
}

/** A radio call delivered as audio, with a mock TTS render. */
async function audioInject(
  invoke: ReturnType<typeof invoker>,
  projectPath: string,
  scenarioId: string,
): Promise<Inject> {
  const created = await invoke<Inject>('injects:create', {
    projectPath,
    scenarioId,
    mselRowId: 'I-03',
    type: 'radio_call',
  })
  await invoke('injects:save', {
    projectPath,
    scenarioId,
    inject: {
      ...created,
      deliveryMode: 'play_audio',
      mediaBrief: {
        paths: ['tts'],
        voiceLines: [{ speaker: 'TSA', text: 'Ops, TSA checkpoint. Screens are frozen.' }],
      },
    },
  })
  await invoke('injects:regenerate-media', {
    projectPath,
    scenarioId,
    injectId: created.id,
    paths: ['tts'],
  })
  await expect
    .poll(
      async () =>
        (
          await invoke<{ assets: { kind: string }[] }>('injects:get', {
            projectPath,
            scenarioId,
            injectId: created.id,
          })
        ).assets.some((a) => a.kind === 'audio'),
      { timeout: 30_000 },
    )
    .toBe(true)
  return created
}

async function presentPage(app: ElectronApplication): Promise<Page> {
  await expect
    .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length)
    .toBe(1)
  return app.windows().find((w) => w.url().includes('#/present/'))!
}

/** Theme follows the OS ("system" setting); emulate it on every open window. */
async function setTheme(pages: Page[], colorScheme: 'light' | 'dark') {
  for (const p of pages) await p.emulateMedia({ colorScheme })
}

test('facilitator: clock, deliver to a second window, notes persist', async () => {
  test.setTimeout(120_000)
  mkdirSync(OUT, { recursive: true })
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  try {
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-fac-'))
    const { path: projectPath } = await invoke<{ path: string }>('project:create', {
      parentDir,
      name: 'NCIA Facilitator E2E',
    })
    const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
      projectPath,
      title: 'Flight to Nowhere',
    })
    const scenarioId = empty.id
    await invoke('scenarios:save', {
      projectPath,
      scenario: { ...FIXTURE, id: scenarioId, projectId: empty.projectId },
    })
    const fids = await renderedInject(invoke, projectPath, scenarioId, 'I-06', 'fids_board')
    await renderedInject(invoke, projectPath, scenarioId, 'I-07', 'memo')
    await renderedInject(invoke, projectPath, scenarioId, 'I-05', 'time_jump_card')
    await audioInject(invoke, projectPath, scenarioId)

    const key = encodeURIComponent(projectPath)
    await setTheme([page], 'light')
    await goTo(page, `#/p/${key}/facilitate`)
    await page.getByRole('link', { name: 'Flight to Nowhere' }).click()
    await expect(page.getByRole('heading', { name: 'Flight to Nowhere', level: 1 })).toBeVisible()
    const timeline = page.getByRole('region', { name: 'Timeline' })
    await expect(timeline.locator('.fac-row')).toHaveCount(24)

    // Clock: start, then set to 1:15 so I-06 is due (START..I-06 are due, 9 rows).
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    await page.getByLabel('Exercise time (H:MM)').fill('1:15')
    await page.getByRole('button', { name: 'Set time', exact: true }).click()
    await expect(page.getByRole('timer', { name: 'Exercise time' })).toHaveText(/^1:15:\d\d$/)
    await expect(timeline.locator('.fac-row--due')).toHaveCount(9)
    await page.locator('.main').evaluate((el) => el.scrollTo(0, 0))
    await page.screenshot({ path: join(OUT, 'light-clock.png') })
    // The 1:00 time jump has passed; the next one is none in Scenario 3. Space on a focused
    // button presses that button, so the shortcut is tried with focus on the page itself.
    await page.evaluate(() =>
      (
        globalThis as unknown as { document: { activeElement: { blur?: () => void } | null } }
      ).document.activeElement?.blur?.(),
    )
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()

    // Deliver the FIDS board: it is a main-screen inject, so the presentation window opens.
    await timeline.getByRole('button', { name: 'Deliver I-06', exact: true }).click()
    const present = await presentPage(app)
    await present.waitForLoadState('domcontentloaded')
    const img = present.getByRole('img')
    await expect(img).toBeVisible()
    await expect
      .poll(() => img.evaluate((el) => (el as unknown as { naturalWidth: number }).naturalWidth))
      .toBeGreaterThan(1000)
    expect(await img.getAttribute('src')).toContain(`/media/${fids.id}/`)
    await expect(timeline.getByText('Delivered 1:15')).toBeVisible()
    await expect(page.locator('.fac-status')).toContainText('I-06 delivered')
    // The presentation shows only the media: no sidebar, no title, no tags.
    await expect(present.getByText('Flight to Nowhere')).toHaveCount(0)
    await expect(present.getByText('Core narrative')).toHaveCount(0)

    // Hot wash note on the delivered inject, autosaved.
    await page.getByLabel('Hot wash notes for I-06').fill('Ops kept the FIDS on for 12 minutes.')
    await expect(page.locator('.fac-status')).toContainText('Saved')

    // Evaluation (#421): rate one of I-06's criteria (a critical task from the TIRP) with a note.
    await page.getByRole('tab', { name: 'Evaluation' }).click()
    await page.getByLabel('Evaluator label (optional)').fill('Evaluator 2')
    const rating = page.getByRole('group', { name: /^Rating for Decide whether to silence the PA/ })
    await expect(rating).toBeVisible()
    await rating.getByRole('radio', { name: 'Partial' }).check()
    await expect(rating.getByRole('radio', { name: 'Partial' })).toBeChecked()
    await page.getByLabel('Note for T-07').fill('PA silenced after 12 minutes; FIDS stayed on.')
    await expect
      .poll(async () => {
        const record = await invoke<{ observations: { id: string; note: string }[] }>(
          'evaluation:get',
          { projectPath, scenarioId },
        )
        return record.observations.find((o) => o.id === 'O-I-06-T-07')?.note
      })
      .toBe('PA silenced after 12 minutes; FIDS stayed on.')
    await page.screenshot({ path: join(OUT, 'light-evaluation.png') })
    await page.getByRole('tab', { name: 'General notes' }).click()
    await page.getByRole('textbox', { name: 'General notes' }).fill('PIO joined late.')
    await expect(page.locator('.fac-status')).toContainText('Saved')

    // Hand-to-role inject: no presentation change, shows the hand-out instruction.
    await page.getByRole('tab', { name: 'Inject' }).click()
    await timeline.getByRole('button', { name: /I-07/ }).first().click()
    await expect(page.getByText('Print / hand to Ops')).toBeVisible()

    await page.screenshot({ path: join(OUT, 'light-facilitate.png') })
    await present.screenshot({ path: join(OUT, 'light-present.png') })
    await setTheme([page, present], 'dark')
    await page.screenshot({ path: join(OUT, 'dark-facilitate.png') })
    await present.screenshot({ path: join(OUT, 'dark-present.png') })
    await page.getByRole('tab', { name: 'Hot wash' }).click()
    // The inject note shows under the task it belongs to and in "All inject notes".
    await expect(page.getByText('Ops kept the FIDS on for 12 minutes.').first()).toBeVisible()
    // The rating rolls up under its objective and capability, with the plan citation.
    const coordination = page.getByRole('region', { name: 'Operational Coordination' })
    await expect(coordination.getByText('Partial 1')).toBeVisible()
    await expect(coordination.getByText(/PA silenced after 12 minutes/)).toBeVisible()
    await expect(
      coordination.getByText('13.6 Scenario C: FIDS / BHS System Failure').first(),
    ).toBeVisible()
    await page.screenshot({ path: join(OUT, 'dark-hotwash.png') })
    await setTheme([page, present], 'light')
    await page.screenshot({ path: join(OUT, 'light-hotwash.png') })

    // Reload: clock, delivery and notes come back from facilitator.json; the rating from
    // evaluation.json.
    await page.reload()
    await expect(page.getByRole('timer', { name: 'Exercise time' })).toHaveText(/^1:15:\d\d$/)
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible()
    await expect(timeline.getByText('Delivered 1:15')).toBeVisible()
    await timeline.getByRole('button', { name: /I-06/ }).first().click()
    await expect(page.getByLabel('Hot wash notes for I-06')).toHaveValue(
      'Ops kept the FIDS on for 12 minutes.',
    )
    await page.getByRole('tab', { name: 'Evaluation' }).click()
    await expect(
      page
        .getByRole('group', { name: /^Rating for Decide whether to silence the PA/ })
        .getByRole('radio', { name: 'Partial' }),
    ).toBeChecked()
    await page.getByRole('tab', { name: 'Inject' }).click()
    const saved = await invoke<{ notes: Record<string, string>; generalNotes: string }>(
      'facilitator:state-get',
      { projectPath, scenarioId },
    )
    expect(saved.notes['I-06']).toBe('Ops kept the FIDS on for 12 minutes.')
    expect(saved.generalNotes).toBe('PIO joined late.')

    // Undo, and Esc on the presentation closes it.
    await timeline.getByRole('button', { name: 'Undo deliver I-06', exact: true }).click()
    await expect(timeline.getByText('Delivered 1:15')).toHaveCount(0)
    // keydown closes the window, so a full press() would fail on its keyup.
    await present.keyboard.down('Escape')
    await expect
      .poll(() => app.windows().filter((w) => w.url().includes('#/present/')).length)
      .toBe(0)

    // Audio inject: delivering plays it in a fresh presentation window with a speaker card.
    await timeline.getByRole('button', { name: 'Deliver I-03', exact: true }).click()
    const audioScreen = await presentPage(app)
    await expect(audioScreen.locator('audio')).toHaveAttribute('src', /\.wav$/)
    await expect(audioScreen.getByRole('button', { name: /(Play|Pause) audio/ })).toBeVisible()
    // Autoplay: no click is needed on the projector for the audio to start.
    await expect
      .poll(() =>
        audioScreen.locator('audio').evaluate((el) => {
          const a = el as unknown as { currentTime: number; ended: boolean }
          return a.currentTime > 0 || a.ended
        }),
      )
      .toBe(true)
    await audioScreen.screenshot({ path: join(OUT, 'light-present-audio.png') })
  } finally {
    await app.close()
  }
})
