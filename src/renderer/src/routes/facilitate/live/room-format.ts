// Plain-text formatting for the Room (#417): durations and target names.
import type { InjectRow } from '@shared/schemas/live'

/** 74 → "1:14", 5 → "0:05". */
export function clock(seconds: number): string {
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const minutes = (m: number): string => `${Math.floor(m)} min`

/** "role:ops" → "Ops"; unknown ids are shown as they are. */
export function targetLabel(target: string, roleName: (id: string) => string | undefined): string {
  if (target === 'all') return 'Everyone'
  if (target.startsWith('role:')) return roleName(target.slice(5)) ?? target.slice(5)
  if (target.startsWith('team:')) return `Team ${target.slice(5)}`
  return target.startsWith('client:') ? 'One device' : target
}

export const ANSWER_LABEL: Record<NonNullable<InjectRow['answered']>, string> = {
  actioned: 'acted on',
  message: 'message',
  marked: 'marked answered',
}
