import { call } from '../../lib/api'

/** Platform wording for "reveal this folder in the file manager". */
export function revealLabel(): string {
  const ua = navigator.userAgent
  if (/Mac/i.test(ua)) return 'Show in Finder'
  if (/Windows/i.test(ua)) return 'Show in Explorer'
  return 'Show in file manager'
}

export const revealFolder = (path: string): Promise<void> => call('shell:show-item', { path })
