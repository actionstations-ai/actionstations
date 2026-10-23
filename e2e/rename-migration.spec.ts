// First launch after the rename (#277): a fake old "Tabletop Generator" settings folder and
// projects folder under a temp home (TTX_TEST_HOME) move to "Action Stations". The real
// settings, Documents and Keychain are never touched: no TTX_USER_DATA, but every OS folder
// the migration reads is redirected into the temp home, and no API keys are seeded.
import { _electron as electron, expect, test } from '@playwright/test'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { invoker } from './helpers'

function seedOldInstall(home: string): { oldProject: string } {
  const oldSettings = join(home, 'appData', 'Tabletop Generator')
  const oldProject = join(home, 'Documents', 'Tabletop Generator', 'City-Water.ttxproj')
  mkdirSync(oldSettings, { recursive: true })
  cpSync(resolve('examples/city-water/project'), oldProject, { recursive: true })
  const settings = {
    onboardingComplete: true,
    recentProjects: [
      { path: oldProject, name: 'City Water', openedAt: '2026-10-20T12:00:00.000Z' },
    ],
  }
  writeFileSync(join(oldSettings, 'settings.json'), JSON.stringify(settings))
  return { oldProject }
}

test('moves the old settings and projects folders on first launch', async () => {
  const home = mkdtempSync(join(tmpdir(), 'ttx-e2e-home-'))
  seedOldInstall(home)
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }
  delete env.TTX_USER_DATA
  const app = await electron.launch({
    args: [resolve('out/main/index.js')],
    env: { ...env, TTX_TEST_HOME: home, TTX_HEADLESS: '1', NODE_ENV: 'test' },
  })
  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    const invoke = invoker(page)
    const newSettings = join(home, 'appData', 'Action Stations')
    const info = await invoke<{ name: string; userDataPath: string }>('app:info')
    expect(info).toMatchObject({ name: 'Action Stations', userDataPath: newSettings })
    expect(await app.evaluate(({ app: a }) => a.getName())).toBe('Action Stations')
    expect(existsSync(join(home, 'appData', 'Tabletop Generator'))).toBe(false)
    const marker = JSON.parse(
      readFileSync(join(newSettings, 'migration-from-tabletop-generator.json'), 'utf8'),
    ) as { settings: string; secretsCheck: string; projects: { status: string } }
    expect(marker).toMatchObject({
      settings: 'renamed',
      secretsCheck: 'done',
      projects: { status: 'renamed' },
    })

    const moved = join(home, 'Documents', 'Action Stations', 'City-Water.ttxproj')
    expect(existsSync(join(moved, 'project.json'))).toBe(true)
    const recent = await invoke<{ path: string }[]>('project:list-recent')
    expect(recent.map((r) => r.path)).toEqual([moved])
    const opened = await invoke<{ path: string }>('project:open', { path: moved })
    expect(opened.path).toBe(moved)

    // New projects get the new extension, in the new default folder.
    const created = await invoke<{ path: string }>('project:create', {
      parentDir: join(home, 'Documents', 'Action Stations'),
      name: 'Harbor Drill',
    })
    expect(created.path).toBe(join(home, 'Documents', 'Action Stations', 'Harbor-Drill.asproj'))
  } finally {
    await app.close()
  }
})
