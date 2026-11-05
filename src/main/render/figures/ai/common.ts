// Helpers the AI incidents figure kinds share. Several kinds draw through a generic kind and then
// extend its text summary; the SVG description must carry the same text as the summary.
import { esc } from '../svg'

/** Replace the SVG's <desc> text with `summary`, so the accessible description matches. */
export function withDescription(svg: string, summary: string): string {
  return svg.replace(
    /(<desc id="[^"]+">)[^<]*(<\/desc>)/,
    (_all, open: string, close: string) => `${open}${esc(summary)}${close}`,
  )
}

export const SIMULATED_NOTE = 'Simulated data for the exercise, not a real system.'
