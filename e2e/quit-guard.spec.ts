// Quitting with unsaved work asks first (#196). An unsaved inject draft (inject edits are saved
// by hand) makes closing the main window, or quitting, show "Quit and discard / Cancel".
// The native dialog is stubbed through the main process; Cancel keeps the app running, and
// "Quit and discard" quits it (closing the main window still ends the process, #191).
import { expect, test } from '@playwright/test'
import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { goTo, invoker, launch } from './helpers'

const CLOSE_BUDGET_MS = 10_000
test.setTimeout(90_000)

const FIXTURE = JSON.parse(
  readFileSync(resolve('tests/fixtures/scenarios/scenario-3.json'), 'utf8'),
) as Record<string, unknown>

let electronProcess: ChildProcess | undefined

test.afterAll(() => {
  const proc = electronProcess
  if (proc && proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
})

interface Prompt {
  buttons: string[]
  message: string
  detail: string
}

test('closing or quitting with an unsaved inject draft asks first', async () => {
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1', TTX_QUIT_PROMPT: 'dialog' })
  electronProcess = app.process()
  const invoke = invoker(page)
  const { path: projectPath } = await invoke<{ path: string }>('project:create', {
    parentDir: mkdtempSync(join(tmpdir(), 'ttx-quit-guard-')),
    name: 'Riverbend Transit',
    orgType: 'transit',
  })
  const empty = await invoke<{ id: string; projectId: string }>('scenarios:create-empty', {
    projectPath,
    title: 'Signal Loss',
  })
  await invoke('scenarios:save', {
    projectPath,
    scenario: { ...FIXTURE, id: empty.id, projectId: empty.projectId },
  })
  const inject = await invoke<{ id: string }>('injects:create', {
    projectPath,
    scenarioId: empty.id,
    mselRowId: 'I-04',
    type: 'tweet',
  })

  // Stub the native dialog: record each prompt, answer with globalThis.__quitAnswer.
  await app.evaluate(({ dialog }) => {
    const g = globalThis as unknown as { __prompts: unknown[]; __quitAnswer: number }
    g.__prompts = []
    g.__quitAnswer = 1
    dialog.showMessageBox = (async (...args: unknown[]) => {
      g.__prompts.push(args.at(-1))
      return { response: g.__quitAnswer, checkboxChecked: false }
    }) as typeof dialog.showMessageBox
  })
  const prompts = () =>
    app.evaluate(() => (globalThis as unknown as { __prompts: Prompt[] }).__prompts)
  const answer = (n: number) =>
    app.evaluate((_e, v) => {
      ;(globalThis as unknown as { __quitAnswer: number }).__quitAnswer = v
    }, n)
  const closeMainWindow = () =>
    app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.webContents.getURL().includes('#/'))
        ?.close()
    })

  // An unsaved draft: edit the title in the inject editor, do not save.
  const key = encodeURIComponent(projectPath)
  await goTo(page, `#/p/${key}/scenarios/${empty.id}/injects/${inject.id}`)
  await page.getByLabel('Title *').fill('Signal outage at Riverbend Junction')
  await expect(page.getByText('Unsaved changes')).toBeVisible()

  // 1. Closing the window: Cancel keeps the app and the draft.
  await closeMainWindow()
  await expect.poll(async () => (await prompts()).length).toBe(1)
  const first = (await prompts())[0]!
  expect(first.buttons).toEqual(['Quit and discard', 'Cancel'])
  expect(first.detail).toContain('1 unsaved inject draft')
  await page.waitForTimeout(500)
  expect(electronProcess.exitCode).toBeNull()
  await expect(page.getByLabel('Title *')).toHaveValue('Signal outage at Riverbend Junction')

  // 2. Quit (Cmd+Q / menu): asks again; Cancel again keeps it running.
  await app.evaluate(({ app: a }) => a.quit())
  await expect.poll(async () => (await prompts()).length).toBe(2)
  await page.waitForTimeout(500)
  expect(electronProcess.exitCode).toBeNull()

  // 3. "Quit and discard" from closing the window ends the process.
  await answer(0)
  const exited = new Promise<number>((done) => {
    const started = Date.now()
    electronProcess!.once('exit', () => done(Date.now() - started))
    setTimeout(() => done(Number.POSITIVE_INFINITY), CLOSE_BUDGET_MS)
  })
  await closeMainWindow().catch(() => undefined)
  expect(await exited).toBeLessThan(CLOSE_BUDGET_MS)
  await app.close().catch(() => undefined)
})
