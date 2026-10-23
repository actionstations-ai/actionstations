import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** userData dir; overridable for tests and e2e via TTX_USER_DATA. */
export function userDataDir(): string {
  if (process.env.TTX_USER_DATA) return resolve(process.env.TTX_USER_DATA)
  return app.getPath('userData')
}

/**
 * Tests only: TTX_TEST_HOME stands in for the OS folders the rename migration (#277) reads,
 * `<home>/appData` and `<home>/Documents`, so a test can seed old folders without touching
 * the real ones.
 */
const testHome = (): string | undefined =>
  process.env.TTX_TEST_HOME ? resolve(process.env.TTX_TEST_HOME) : undefined

/** The OS folder that holds per-app settings folders. */
export function appDataDir(): string {
  const home = testHome()
  return home ? join(home, 'appData') : app.getPath('appData')
}

/** The user's Documents folder (default parent of the projects folder). */
export function documentsDir(): string {
  const home = testHome()
  return home ? join(home, 'Documents') : app.getPath('documents')
}

/**
 * Unpackaged, `electron out/main/index.js` (preview, e2e) reports out/main as the app path;
 * `electron .` (dev) reports the project root. Walk up to the nearest package.json so the
 * shipped prompts/, templates/ and comfy/ folders are found either way.
 */
function unpackagedRoot(): string {
  let dir = resolve(app.getAppPath())
  for (let i = 0; i < 4 && !existsSync(join(dir, 'package.json')); i++) dir = dirname(dir)
  return dir
}

/** Repo/app resource root: templates/, prompts/, comfy/ live here. */
export function resourcesDir(): string {
  if (process.env.TTX_RESOURCES) return resolve(process.env.TTX_RESOURCES)
  return app.isPackaged ? join(process.resourcesPath, 'app-resources') : unpackagedRoot()
}

export const resourcePath = (...p: string[]): string => join(resourcesDir(), ...p)
export const userDataPath = (...p: string[]): string => join(userDataDir(), ...p)
