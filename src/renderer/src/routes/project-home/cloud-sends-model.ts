// Filters for the send log (#433). Pure.
import type { CloudSendEntry } from '@shared/schemas'

export interface Filters {
  provider: string
  stage: string
  from: string
}

export function filterSends(entries: CloudSendEntry[], f: Filters): CloudSendEntry[] {
  return entries.filter(
    (e) =>
      (!f.provider || e.providerId === f.provider) &&
      (!f.stage || (e.stage ?? e.task) === f.stage) &&
      (!f.from || e.at.slice(0, 10) >= f.from),
  )
}
