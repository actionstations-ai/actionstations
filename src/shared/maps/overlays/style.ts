// Style tokens for map overlays (#652). Each token has a colour that reads on a light map and a
// line pattern and fill hatch of its own, so a map printed in grey or seen with colour
// blindness still tells the tokens apart (NFR-3). The legend shows all three.
import type { OverlayToken } from '../../schemas/map-overlays'

export type Hatch = 'none' | 'diagonal' | 'cross' | 'dots' | 'horizontal'

export interface TokenStyle {
  /** Line, outline and point colour; at least 3:1 against white. */
  color: string
  /** Fill colour for areas (the same hue, drawn translucent). */
  fill: string
  /** Dash lengths in line widths; empty is a solid line. */
  dash: number[]
  hatch: Hatch
  /** Name used when a layer has no legend text for the token. */
  name: string
}

export const TOKEN_STYLE: Record<OverlayToken, TokenStyle> = {
  neutral: { color: '#4a5560', fill: '#6b7785', dash: [], hatch: 'none', name: 'Area' },
  info: { color: '#1f5fa8', fill: '#3b82d6', dash: [], hatch: 'dots', name: 'Information' },
  watch: { color: '#8a6100', fill: '#e0a800', dash: [6, 3], hatch: 'diagonal', name: 'Watch' },
  warning: { color: '#b3430f', fill: '#e8742a', dash: [2, 2], hatch: 'cross', name: 'Warning' },
  critical: { color: '#a50f2d', fill: '#d6264a', dash: [], hatch: 'horizontal', name: 'Critical' },
  ok: { color: '#1b6e3a', fill: '#3aa564', dash: [8, 2, 2, 2], hatch: 'none', name: 'Normal' },
  water: { color: '#0b6b8a', fill: '#2ea3c8', dash: [10, 4], hatch: 'dots', name: 'Water' },
  muted: { color: '#5b6470', fill: '#a3abb5', dash: [1, 3], hatch: 'none', name: 'Context' },
}

/** WCAG relative luminance of "#rrggbb". */
export function luminance(hex: string): number {
  const chan = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * chan(0) + 0.7152 * chan(1) + 0.0722 * chan(2)
}

/** WCAG contrast ratio of two "#rrggbb" colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
