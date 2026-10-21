import { app } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** userData dir; overridable for tests and e2e via TTX_USER_DATA. */
export function userDataDir(): string {
  if (process.env.TTX_USER_DATA) return resolve(process.env.TTX_USER_DATA)
  return app.getPath('userData')
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
