// Radar color tables. Reflectivity uses the long-standing NWS 5 dBZ steps; velocity uses green
// for motion toward the radar and red for motion away, in 10 knot steps; correlation coefficient
// uses a cool-to-warm ramp. A legend with the numeric ranges always accompanies the image, and
// the figure's text summary carries the values, so color is never the only way to read it.

export interface Band {
  /** Lower bound of the band (inclusive), in the product's unit. */
  min: number
  color: string
}

export interface Palette {
  /** Product name for the legend title. */
  title: string
  unit: string
  /** Ascending bands; a value below the first band's `min` is not drawn. */
  bands: readonly Band[]
  /** Decimals used in labels. */
  decimals: number
}

export const REFLECTIVITY: Palette = {
  title: 'Reflectivity',
  unit: 'dBZ',
  decimals: 0,
  bands: [
    { min: 5, color: '#04e9e7' },
    { min: 10, color: '#019ff4' },
    { min: 15, color: '#0300f4' },
    { min: 20, color: '#02fd02' },
    { min: 25, color: '#01c501' },
    { min: 30, color: '#008e00' },
    { min: 35, color: '#fdf802' },
    { min: 40, color: '#e5bc00' },
    { min: 45, color: '#fd9500' },
    { min: 50, color: '#fd0000' },
    { min: 55, color: '#d40000' },
    { min: 60, color: '#bc0000' },
    { min: 65, color: '#f800fd' },
    { min: 70, color: '#9854c6' },
    { min: 75, color: '#fdfdfd' },
  ],
}

/** Knots; negative is toward the radar. */
export const VELOCITY: Palette = {
  title: 'Radial velocity',
  unit: 'kt',
  decimals: 0,
  bands: [
    { min: -200, color: '#00fff0' },
    { min: -60, color: '#00a050' },
    { min: -50, color: '#00c060' },
    { min: -40, color: '#10e060' },
    { min: -30, color: '#50f070' },
    { min: -20, color: '#90f8a0' },
    { min: -10, color: '#c8fcd0' },
    { min: -2, color: '#9c9c9c' },
    { min: 2, color: '#fcd0d0' },
    { min: 10, color: '#f8a0a0' },
    { min: 20, color: '#f46868' },
    { min: 30, color: '#f03030' },
    { min: 40, color: '#e00000' },
    { min: 50, color: '#b00000' },
    { min: 60, color: '#780000' },
  ],
}

export const CORRELATION: Palette = {
  title: 'Correlation coefficient',
  unit: '',
  decimals: 2,
  bands: [
    { min: 0.2, color: '#3b1f6e' },
    { min: 0.45, color: '#5c4fd1' },
    { min: 0.65, color: '#3a8dde' },
    { min: 0.75, color: '#2fb7a0' },
    { min: 0.85, color: '#7fcf5a' },
    { min: 0.9, color: '#e4e04a' },
    { min: 0.95, color: '#f2a33a' },
    { min: 0.97, color: '#e0522e' },
    { min: 0.99, color: '#a81d1d' },
  ],
}

/** Index of the band holding `value`, or -1 when it is below the first band. */
export function bandIndex(p: Palette, value: number): number {
  let lo = -1
  for (let i = 0; i < p.bands.length; i++) {
    if (value >= p.bands[i]!.min) lo = i
    else break
  }
  return lo
}

export function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/** Label of a band for a legend: "50 to 55", "75 and above", "below -50". */
export function bandLabel(p: Palette, i: number): string {
  const f = (v: number) => v.toFixed(p.decimals)
  const lo = p.bands[i]!.min
  const hi = p.bands[i + 1]?.min
  if (hi === undefined) return `${f(lo)} and above`
  return `${f(lo)} to ${f(hi)}`
}
