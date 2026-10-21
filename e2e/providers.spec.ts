// Providers page (#21) and routing (#22) in the built app. The mock provider is seeded with
// TTX_MOCK_PROVIDERS=1; the LM Studio part runs against a real local LM Studio and is
// skipped when 127.0.0.1:1234 is not reachable.
import { expect, test, type Page } from '@playwright/test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { invoker, launch } from './helpers'

const LM_MODEL = 'qwen3-30b-a3b-2507'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const readJson = (file: string): any => JSON.parse(readFileSync(file, 'utf8'))

async function lmStudioModels(): Promise<string[] | null> {
  try {
    const res = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(800) })
    if (!res.ok) return null
    const body = (await res.json()) as { data: { id: string }[] }
    return body.data.map((m) => m.id)
  } catch {
    return null
  }
}

async function openProviders(page: Page) {
  await page.getByRole('link', { name: 'Providers' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Providers' })).toBeVisible()
}

test('mock provider is seeded, healthy, testable and routed to every task', async () => {
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openProviders(page)
    const card = page.getByRole('article', { name: 'Mock (offline)' })
    await expect(card.getByText('Reachable · 0 ms')).toBeVisible()
    await card.getByRole('button', { name: 'Test' }).click()
    await expect(card.getByRole('status')).toHaveText(/Replied “Mock response\.” in \d+ ms/)
    for (const task of [
      'Ideation',
      'Drafting',
      'Critique',
      'Embeddings',
      'Image',
      'Video',
      'Audio',
    ])
      await expect(page.getByLabel(`${task} provider`)).toHaveValue('mock')
    await page.screenshot({ path: 'test-results/providers-mock.png', fullPage: true })
  } finally {
    await app.close()
  }
})

test('LM Studio: detect, add, list models, test, route globally and per project', async () => {
  const models = await lmStudioModels()
  test.skip(models === null, 'LM Studio is not running on 127.0.0.1:1234')
  test.skip(!models!.includes(LM_MODEL), `${LM_MODEL} is not loaded in LM Studio`)
  test.setTimeout(180_000)

  const { app, page, userData } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    await page.setViewportSize({ width: 1280, height: 900 })
    await openProviders(page)

    await page.getByRole('button', { name: 'Detect local services' }).click()
    const detected = page.getByRole('list', { name: 'Detected services' })
    await expect(detected.getByText(/LM Studio/)).toBeVisible()
    await detected.getByRole('button', { name: 'Add LM Studio' }).click()
    await expect(detected.getByText('Added')).toBeVisible()
    const card = page.getByRole('article', { name: 'LM Studio' })
    await expect(card).toBeVisible()

    const providers = await invoke<{ id: string; label: string }[]>('providers:list')
    const lm = providers.find((p) => p.label === 'LM Studio')!
    const listed = await page.evaluate(
      (id) =>
        (
          globalThis as unknown as {
            ttx: {
              invoke: (
                c: string,
                p: unknown,
              ) => Promise<{ ok: boolean; error?: { message: string } }>
            }
          }
        ).ttx.invoke('providers:models', { id }),
      lm.id,
    )
    test.skip(
      !listed.ok && /No adapter/.test(listed.error?.message ?? ''),
      'openai-compatible adapter not merged yet',
    )
    const ids = (await invoke<{ id: string }[]>('providers:models', { id: lm.id })).map((m) => m.id)
    expect(ids).toContain(LM_MODEL)
    await expect(card.getByText('Reachable', { exact: false })).toBeVisible()

    // Pick the default model with the model picker, then run the connection test.
    await card.getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit LM Studio' })
    await dialog.getByLabel('Default model').fill(LM_MODEL)
    await dialog.getByRole('button', { name: 'Save provider' }).click()
    await expect(dialog).toBeHidden()
    await expect(card.getByText(LM_MODEL)).toBeVisible()
    await card.getByRole('button', { name: 'Test' }).click()
    await expect(card.getByRole('status')).toHaveText(/Replied “.*OK.*” in \d+ ms/i, {
      timeout: 120_000,
    })
    console.log('LM Studio test:', await card.getByRole('status').textContent())

    // Global routing: Drafting → LM Studio / qwen.
    await page.getByLabel('Drafting provider').selectOption(lm.id)
    await page.getByLabel('Drafting model').fill(LM_MODEL)
    await page.getByRole('button', { name: 'Save routing' }).click()
    await expect(page.getByText('Routing saved')).toBeVisible()
    const settings = readJson(join(userData, 'settings.json'))
    expect(settings.defaultRouting.draft).toEqual({ providerId: lm.id, model: LM_MODEL })
    expect(settings.defaultRouting.critique).toEqual({ providerId: 'mock' })
    await page.screenshot({ path: 'test-results/providers-lmstudio.png', fullPage: true })

    // Project override: Critique → LM Studio for this project only.
    const parentDir = mkdtempSync(join(tmpdir(), 'ttx-e2e-providers-'))
    const { path } = await invoke<{ path: string }>('project:open', {
      path: (await invoke<{ path: string }>('project:create', { parentDir, name: 'Rivergate' }))
        .path,
    })
    await page.evaluate(
      (p) =>
        ((globalThis as unknown as { location: { hash: string } }).location.hash =
          `#/p/${encodeURIComponent(p)}/providers`),
      path,
    )
    await expect(
      page.getByRole('heading', { level: 2, name: 'Routing for this project' }),
    ).toBeVisible()
    await expect(page.getByText(`Inherits LM Studio · ${LM_MODEL}`)).toBeVisible()
    await page.getByLabel('Override Critique').check()
    await page.getByLabel('Critique provider').selectOption(lm.id)
    await page.getByRole('button', { name: 'Save routing' }).click()
    await expect
      .poll(() => readJson(join(path, 'project.json')).providerRouting)
      .toEqual({ critique: { providerId: lm.id } })
    const view = await invoke<{ effective: Record<string, { providerId: string }> }>(
      'routing:get',
      { projectPath: path },
    )
    expect(view.effective.critique!.providerId).toBe(lm.id)
    expect(view.effective.ideate!.providerId).toBe('mock')
    await page.screenshot({ path: 'test-results/providers-project.png', fullPage: true })
  } finally {
    await app.close()
  }
})
