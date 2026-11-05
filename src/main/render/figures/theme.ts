// Figure colors and cues. The values mirror the design tokens (src/renderer/src/styles/tokens.css:
// brand blue, accent red, ink) plus status greens and ambers chosen for 4.5:1 text and 3:1 graphics
// contrast on white. Figures render in the template window, which has no CSS variables from the app,
// so the values live here. Color is never the only cue: every series also has a dash, a marker and
// a fill pattern, and every status has a symbol and a word.

export const INK = '#14100c'
export const MUTED = '#594c3c'
export const GRID = '#d8c79e'
export const AXIS = '#14100c'
export const SURFACE = '#ffffff'
export const FONT = "Inter, 'Helvetica Neue', Arial, sans-serif"

export interface SeriesStyle {
  color: string
  dash: string | undefined
  marker: 'circle' | 'square' | 'triangle' | 'diamond' | 'cross'
  pattern: 'solid' | 'hatch' | 'dots' | 'cross' | 'bars'
}

export const SERIES_STYLES: readonly SeriesStyle[] = [
  { color: '#1f5fbf', dash: undefined, marker: 'circle', pattern: 'solid' },
  { color: '#b3121b', dash: '7 4', marker: 'square', pattern: 'hatch' },
  { color: '#1b7a3a', dash: '2 3', marker: 'triangle', pattern: 'dots' },
  { color: '#8a4b00', dash: '10 3 2 3', marker: 'diamond', pattern: 'cross' },
  { color: '#6d3fb5', dash: '4 4', marker: 'cross', pattern: 'bars' },
  { color: '#0f6f6f', dash: '12 4', marker: 'circle', pattern: 'hatch' },
]

export const seriesStyle = (i: number): SeriesStyle => SERIES_STYLES[i % SERIES_STYLES.length]!

export type StatusState = 'ok' | 'degraded' | 'down' | 'unknown'

export interface StatusStyle {
  label: string
  color: string
  tint: string
  symbol: 'circle' | 'triangle' | 'square' | 'ring'
}

export const STATUS_STYLES: Record<StatusState, StatusStyle> = {
  ok: { label: 'Operational', color: '#1b7a3a', tint: '#e3f3e8', symbol: 'circle' },
  degraded: { label: 'Degraded', color: '#8a5a00', tint: '#fff0c2', symbol: 'triangle' },
  down: { label: 'Down', color: '#b3121b', tint: '#fbe1e2', symbol: 'square' },
  unknown: { label: 'Unknown', color: '#594c3c', tint: '#ece6d8', symbol: 'ring' },
}
