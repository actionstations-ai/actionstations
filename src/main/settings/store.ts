import { AppSettings } from '@shared/schemas'
import { readJsonOr, writeJsonAtomic } from '../lib/fs'
import { userDataPath } from '../lib/paths'

let cache: AppSettings | null = null
let loading: Promise<AppSettings> | null = null
let chain: Promise<unknown> = Promise.resolve()

const file = (): string => userDataPath('settings.json')

async function load(): Promise<AppSettings> {
  if (cache) return cache
  loading ??= readJsonOr(file(), AppSettings, () => AppSettings.parse({})).then((s) => {
    cache = s
    return s
  })
  return loading
}

/** A copy of the current settings (callers can't mutate the cache by accident). */
export async function getSettings(): Promise<AppSettings> {
  return structuredClone(await load())
}

/**
 * Apply a mutation and persist. Read-modify-write runs inside one serialized chain so
 * concurrent updates never clobber each other, and a failed write doesn't block later ones.
 */
export function updateSettings(
  mutate: (s: AppSettings) => AppSettings | void,
): Promise<AppSettings> {
  const run = chain
    .catch(() => undefined)
    .then(async () => {
      const draft = structuredClone(await load())
      const next = AppSettings.parse(mutate(draft) ?? draft)
      await writeJsonAtomic(file(), next)
      cache = next
      return structuredClone(next)
    })
  chain = run
  return run
}

/** Tests only. */
export function resetSettingsCache(): void {
  cache = null
  loading = null
  chain = Promise.resolve()
}
