/**
 * A phone, radio or voicemail inject played as a call on the players' devices (spec 0429): the
 * words of the inject become the first line of the call, spoken by the party the row is from.
 * Pure, so the caller, the words and the targets are tested without a session.
 */
import type { Destination } from '@shared/live/schemas'
import type { Inject } from '@shared/schemas'
import type { Role } from '@shared/schemas/project'
import type { MselRow } from '@shared/schemas/scenario'
import { isCallInject } from '@shared/live/call-types'
import { resolveTargets } from './deliver'

export { isCallInject }

export interface InjectCall {
  targets: Destination[]
  persona: { name: string }
  transcript: string
  injectId?: string
  mselRowId: string
}

const MAX_TRANSCRIPT = 4_000

/** What the caller says: the voice lines in order, else the row's event. */
function wordsOf(row: Pick<MselRow, 'event'>, inject: Inject | undefined): string {
  const lines = (inject?.mediaBrief?.voiceLines ?? [])
    .map((l) => l.text.trim())
    .filter((t) => t.length > 0)
  return (lines.length ? lines.join(' ') : row.event.trim()).slice(0, MAX_TRANSCRIPT)
}

export function callFromRow(
  row: Pick<MselRow, 'id' | 'from' | 'event' | 'toRoleIds' | 'toLabel' | 'toTeams'>,
  inject: Inject | undefined,
  roles: readonly Pick<Role, 'id' | 'team'>[],
): InjectCall {
  const voice = inject?.mediaBrief?.voiceLines?.find((l) => l.speaker.trim())?.speaker.trim()
  const name = (row.from.trim() || voice || 'Caller').slice(0, 120)
  return {
    targets: resolveTargets(row, inject?.deliveryMode, roles),
    persona: { name },
    transcript: wordsOf(row, inject),
    ...(inject ? { injectId: inject.id } : {}),
    mselRowId: row.id,
  }
}
