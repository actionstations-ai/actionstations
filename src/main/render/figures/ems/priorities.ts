// Triage priorities as figures draw them (spec 0456 NFR-3): every priority has a word and a fill
// pattern as well as a color, so a board reads in grayscale and aloud. The colors match the
// triage tag templates.
import { n } from '../svg'

export type PriorityId = 'immediate' | 'delayed' | 'minor' | 'expectant' | 'deceased'

export interface PriorityStyle {
  id: PriorityId
  label: string
  color: string
  /** Text color that reads on `color`. */
  ink: string
  pattern: 'solid' | 'stripes' | 'dots' | 'bars' | 'outline'
}

export const PRIORITIES: readonly PriorityStyle[] = [
  { id: 'immediate', label: 'Immediate', color: '#b3261e', ink: '#ffffff', pattern: 'solid' },
  { id: 'delayed', label: 'Delayed', color: '#e8c20f', ink: '#14100c', pattern: 'stripes' },
  { id: 'minor', label: 'Minor', color: '#1f6f35', ink: '#ffffff', pattern: 'dots' },
  { id: 'expectant', label: 'Expectant', color: '#14100c', ink: '#ffffff', pattern: 'bars' },
  { id: 'deceased', label: 'Deceased', color: '#ffffff', ink: '#14100c', pattern: 'outline' },
]

export const priorityStyle = (id: PriorityId): PriorityStyle =>
  PRIORITIES.find((p) => p.id === id) as PriorityStyle

/** Case-insensitive lookup of a priority from its word. */
export function priorityFromLabel(label: string): PriorityStyle | undefined {
  const k = label.trim().toLowerCase()
  return PRIORITIES.find((p) => p.id === k || p.label.toLowerCase() === k)
}

/** Pattern definitions for every priority; `key` keeps ids unique between figures. */
export function priorityDefs(key: string): string {
  return PRIORITIES.map((p) => {
    const id = `pri-${key}-${p.id}`
    const base = `<rect width="8" height="8" fill="${p.color}"/>`
    const body: Record<PriorityStyle['pattern'], string> = {
      solid: base,
      stripes: `${base}<path d="M-1 1L1 -1M0 8L8 0M7 9L9 7" stroke="#14100c" stroke-width="1.6"/>`,
      dots: `${base}<circle cx="2" cy="2" r="1.2" fill="#ffffff"/><circle cx="6" cy="6" r="1.2" fill="#ffffff"/>`,
      bars: `${base}<path d="M0 2H8M0 6H8" stroke="#8c8c8c" stroke-width="1.4"/>`,
      outline: base,
    }
    return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse">${body[p.pattern]}</pattern>`
  }).join('')
}

/** A filled rectangle in a priority's pattern; deceased is white with a heavy outline. */
export function prioritySwatch(
  key: string,
  p: PriorityStyle,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const stroke = p.id === 'deceased' ? `stroke="#14100c" stroke-width="2"` : ''
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="url(#pri-${key}-${p.id})" ${stroke}/>`
}
