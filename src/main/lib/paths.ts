import { app } from 'electron'
import { join, resolve } from 'node:path'

/** userData dir; overridable for tests and e2e via TTX_USER_DATA. */
export function userDataDir(): string {
  if (process.env.TTX_USER_DATA) return resolve(process.env.TTX_USER_DATA)
  return app.getPath('userData')
}

/** Repo/app resource root: templates/, prompts/, comfy/ live here. */
export function resourcesDir(): string {
  if (process.env.TTX_RESOURCES) return resolve(process.env.TTX_RESOURCES)
  return app.isPackaged ? join(process.resourcesPath, 'app-resources') : app.getAppPath()
}

export const resourcePath = (...p: string[]): string => join(resourcesDir(), ...p)
export const userDataPath = (...p: string[]): string => join(userDataDir(), ...p)
