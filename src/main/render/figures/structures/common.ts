// Shared by the structures figure kinds (spec 0471 FR-5): the placard states with a word, a
// color and a shape each (color is never the only cue), the priority classes and small drawing
// helpers kept in this folder so they cannot collide with other fields' files.
import { z } from 'zod'
import { n } from '../svg'

export const PLACARD_STATES = [
  'INSPECTED',
  'RESTRICTED USE',
  'UNSAFE',
  'NOT YET EVALUATED',
] as const
export const PlacardState = z.enum(PLACARD_STATES)
export type PlacardState = z.infer<typeof PlacardState>

export interface PlacardStyle {
  /** Stroke and text color with 4.5:1 contrast on white. */
  color: string
  /** Fill of the cell or marker. */
  tint: string
  /** The color named in words for the summary. */
  colorWord: string
  symbol: 'circle' | 'triangle' | 'square' | 'ring'
}

export const PLACARD_STYLE: Record<PlacardState, PlacardStyle> = {
  INSPECTED: { color: '#1b7a3a', tint: '#d6efdd', colorWord: 'green', symbol: 'circle' },
  'RESTRICTED USE': { color: '#7a5200', tint: '#fbe38a', colorWord: 'yellow', symbol: 'triangle' },
  UNSAFE: { color: '#b3121b', tint: '#f6c9cc', colorWord: 'red', symbol: 'square' },
  'NOT YET EVALUATED': { color: '#594c3c', tint: '#ece6d8', colorWord: 'gray', symbol: 'ring' },
}

export const PRIORITIES = ['hospital', 'shelter', 'school', 'other'] as const
export const Priority = z.enum(PRIORITIES)
export type Priority = z.infer<typeof Priority>
export const PRIORITY_LABEL: Record<Priority, string> = {
  hospital: 'Hospital or critical facility',
  shelter: 'Shelter',
  school: 'School',
  other: 'Other',
}

/** A placard marker centered on (x, y): a different shape for each state. */
export function placardSymbol(state: PlacardState, x: number, y: number, r = 7): string {
  const s = PLACARD_STYLE[state]
  switch (s.symbol) {
    case 'triangle':
      return `<path d="M${n(x)} ${n(y - r)}L${n(x + r)} ${n(y + r - 1)}L${n(x - r)} ${n(y + r - 1)}Z" fill="${s.tint}" stroke="${s.color}" stroke-width="2"/>`
    case 'square':
      return (
        `<rect x="${n(x - r + 1)}" y="${n(y - r + 1)}" width="${n(2 * r - 2)}" height="${n(2 * r - 2)}" fill="${s.color}"/>` +
        `<path d="M${n(x - r / 2)} ${n(y - r / 2)}L${n(x + r / 2)} ${n(y + r / 2)}M${n(x + r / 2)} ${n(y - r / 2)}L${n(x - r / 2)} ${n(y + r / 2)}" stroke="#ffffff" stroke-width="1.8"/>`
      )
    case 'ring':
      return `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r - 1)}" fill="none" stroke="${s.color}" stroke-width="2"/>`
    default:
      return (
        `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${s.color}"/>` +
        `<path d="M${n(x - r / 2)} ${n(y)}L${n(x - r / 6)} ${n(y + r / 2.4)}L${n(x + r / 2)} ${n(y - r / 2.4)}" stroke="#ffffff" stroke-width="1.8" fill="none"/>`
      )
  }
}

export const isoTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'not a date or time')

/** "2026-11-06 10:40 UTC" for an ISO time, kept the same everywhere in the structures figures. */
export function stamp(iso: string): string {
  const d = new Date(Date.parse(iso))
  const p = (v: number): string => String(v).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`
}

/** The state a building shows at a time: not yet evaluated until its placard was posted. */
export function stateAt(
  placard: PlacardState,
  postedAt: string | undefined,
  asOf: string | undefined,
): PlacardState {
  if (placard === 'NOT YET EVALUATED') return placard
  if (postedAt && asOf && Date.parse(postedAt) > Date.parse(asOf)) return 'NOT YET EVALUATED'
  return placard
}

/** Counts by state in the fixed order of PLACARD_STATES. */
export function countStates(states: readonly PlacardState[]): Record<PlacardState, number> {
  const out: Record<PlacardState, number> = {
    INSPECTED: 0,
    'RESTRICTED USE': 0,
    UNSAFE: 0,
    'NOT YET EVALUATED': 0,
  }
  for (const s of states) out[s]++
  return out
}

export function countsSentence(c: Record<PlacardState, number>): string {
  return PLACARD_STATES.map(
    (s) => `${c[s]} ${s}${s === 'NOT YET EVALUATED' ? '' : ` (${PLACARD_STYLE[s].colorWord})`}`,
  ).join(', ')
}
