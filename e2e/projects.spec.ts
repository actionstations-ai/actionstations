import { expect, test, type Page } from '@playwright/test'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, openProjectSettings } from './helpers'

type Invoke = (c: string, p: unknown) => Promise<{ ok: boolean; data?: unknown }>
const invoke = (page: Page, channel: string, req: unknown) =>
  page.evaluate(
    ([c, r]) => (globalThis as unknown as { ttx: { invoke: Invoke } }).ttx.invoke(c as string, r),
    [channel, req] as const,
  )

test('create a project, edit its settings, and see them persist', async () => {
  const { app, page } = await launch()
  const parent = mkdtempSync(join(tmpdir(), 'ttx-e2e-projects-'))
  await page.setViewportSize({ width: 1280, height: 860 })

  // A native folder dialog would block; point the default location at a temp dir instead.
  expect(await invoke(page, 'settings:update', { defaultProjectsDir: parent })).toMatchObject({
    ok: true,
  })
  await page.reload()

  await page.getByRole('button', { name: 'New project' }).click()
  const dialog = page.getByRole('dialog', { name: 'New project' })
  await expect(dialog.getByLabel('Project name')).toBeFocused()
  await expect(dialog.getByLabel('Location')).toHaveValue(parent)
  await dialog.getByLabel('Project name').fill('Northfield Regional Airport')
  await dialog.getByLabel('Organization', { exact: true }).fill('NRAA')
  await dialog.getByRole('combobox', { name: 'Domain' }).fill('airport')
  await dialog.getByRole('option', { name: /^Airport/ }).click()
  await page.screenshot({ path: 'test-results/projects-new-dialog.png' })
  await dialog.getByRole('button', { name: 'Create project' }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: /Northfield Regional Airport/ }),
  ).toBeVisible()
  expect(decodeURIComponent(page.url())).toContain('/p/')
  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible()

  const root = join(parent, 'Northfield-Regional-Airport.ttxproj')
  for (const entry of ['project.json', 'documents', 'scenarios', 'prompts', '.gitignore'])
    expect(existsSync(join(root, entry)), entry).toBe(true)

  // The Overview opens on the checklist; settings sit in a collapsed section (#226).
  await expect(page.getByRole('region', { name: 'Get this exercise ready' })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Next: Import documents/ })).toBeVisible()
  await openProjectSettings(page)

  // Edit org name, add an alias and a role.
  await page.getByLabel('Organization name').fill('Northfield Regional Airport Authority')
  await page.getByLabel('City').fill('Northfield')
  await page.getByRole('button', { name: 'Add alias' }).click()
  await expect(page.getByLabel('Alias 1 key')).toBeFocused()
  await page.getByLabel('Alias 1 key').fill('localTv')
  await page.getByLabel('Alias 1 value').fill('WNFD Channel 5')
  await page.getByRole('button', { name: 'Add role' }).click()
  await expect(page.getByLabel('Role name')).toBeFocused()
  await page.getByLabel('Role name').fill('Airport Security Coordinator')
  await page.getByLabel('Abbreviation').fill('ASC')
  await page.getByLabel('Team').fill('Security')
  await page.getByLabel('Standing orders').fill('Notify TSA within 1 hour\nOpen the EOC')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Project settings saved')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/projects-home-saved.png', fullPage: true })

  const onDisk = JSON.parse(readFileSync(join(root, 'project.json'), 'utf8'))
  expect(onDisk.orgName).toBe('Northfield Regional Airport Authority')
  expect(onDisk.brand).toMatchObject({ city: 'Northfield', aliases: { localTv: 'WNFD Channel 5' } })
  expect(onDisk.defaultRoles).toEqual([
    expect.objectContaining({
      name: 'Airport Security Coordinator',
      abbreviation: 'ASC',
      team: 'Security',
      standingOrders: ['Notify TSA within 1 hour', 'Open the EOC'],
    }),
  ])

  // Reload: the form comes back from project.json (and the section stays open).
  await page.reload()
  await openProjectSettings(page)
  await expect(page.getByLabel('Organization name')).toHaveValue(
    'Northfield Regional Airport Authority',
  )
  await expect(page.getByLabel('Role name')).toHaveValue('Airport Security Coordinator')
  await expect(page.getByLabel('Standing orders')).toHaveValue(
    'Notify TSA within 1 hour\nOpen the EOC',
  )
  await expect(page.getByLabel('Alias 1 value')).toHaveValue('WNFD Channel 5')
  await page.getByRole('button', { name: 'Add role' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/projects-home-roles.png' })

  await app.close()
})

test('recent project cards: menu actions, archive, and focus return', async () => {
  const { app, page } = await launch()
  const parent = mkdtempSync(join(tmpdir(), 'ttx-e2e-projects-'))
  await page.setViewportSize({ width: 960, height: 760 })
  await invoke(page, 'project:create', {
    parentDir: parent,
    name: 'Mercy General',
    orgName: 'Mercy Health',
    orgType: 'hospital',
  })
  await invoke(page, 'project:create', {
    parentDir: parent,
    name: 'Lakeside Campus',
    orgName: 'Lakeside University',
    orgType: 'campus',
  })
  await page.reload()

  await expect(page.getByRole('heading', { level: 2, name: 'Mercy General' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Lakeside Campus' })).toBeVisible()

  // Duplicate dialog opened from the menu; Escape returns focus to the menu trigger.
  const trigger = page.getByRole('button', { name: 'More actions for Mercy General' })
  await trigger.click()
  await page.getByRole('menuitem', { name: 'Duplicate…' }).click()
  const dup = page.getByRole('dialog', { name: /Duplicate/ })
  await expect(dup.getByLabel('Name of the copy')).toHaveValue('Mercy General (copy)')
  await page.keyboard.press('Escape')
  await expect(dup).toBeHidden()
  await expect(trigger).toBeFocused()

  // Archive via keyboard: the card moves to the Archived section with a badge.
  await trigger.press('Enter')
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  const archived = page.getByRole('region', { name: 'Archived' })
  await expect(archived.getByRole('heading', { name: 'Mercy General' })).toBeVisible()
  await expect(archived.locator('.badge', { hasText: 'Archived' })).toBeVisible()
  await page.screenshot({ path: 'test-results/projects-list.png', fullPage: true })

  // Duplicate for real: opens the copy.
  await page.getByRole('button', { name: 'More actions for Lakeside Campus' }).click()
  await page.getByRole('menuitem', { name: 'Duplicate…' }).click()
  await page.getByLabel('Name of the copy').fill('Lakeside Campus 2027')
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Lakeside Campus 2027/ })).toBeVisible()
  expect(existsSync(join(parent, 'Lakeside-Campus-2027.ttxproj', 'project.json'))).toBe(true)

  // Forget removes the card but leaves the folder.
  await page.getByRole('link', { name: 'Projects' }).click()
  await page.getByRole('button', { name: 'More actions for Lakeside Campus', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Remove from recent' }).click()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Lakeside Campus', exact: true }),
  ).toBeHidden()
  expect(existsSync(join(parent, 'Lakeside-Campus.ttxproj', 'project.json'))).toBe(true)

  await app.close()
})

test('settings page saves theme and embedding mode', async () => {
  const { app, page } = await launch()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible()
  await page.getByLabel('Theme').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByLabel('Embedding mode').selectOption('local-onnx')
  await expect(page.getByText('Embedding mode saved')).toBeVisible()
  await page.screenshot({ path: 'test-results/settings-dark.png', fullPage: true })
  const res = (await invoke(page, 'settings:get', undefined)) as {
    data: { ui: { theme: string }; embeddings: { mode: string } }
  }
  expect(res.data.ui.theme).toBe('dark')
  expect(res.data.embeddings.mode).toBe('local-onnx')
  await app.close()
})
