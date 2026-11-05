// Color tables for gridded fields (satellite, model panels, mesoanalysis). Every figure lists
// the numeric range of each color in a legend and states key values in its text summary.
import type { Palette } from './palettes'

const ramp = (
  unit: string,
  title: string,
  decimals: number,
  colors: [number, string][],
): Palette => ({
  title,
  unit,
  decimals,
  bands: colors.map(([min, color]) => ({ min, color })),
})

export const GRID_PALETTES = {
  visible: ramp('% reflectance', 'Visible reflectance', 0, [
    [0, '#0a0a0a'],
    [10, '#2b2b2b'],
    [20, '#4a4a4a'],
    [30, '#696969'],
    [40, '#878787'],
    [50, '#a3a3a3'],
    [60, '#bdbdbd'],
    [70, '#d4d4d4'],
    [80, '#e8e8e8'],
    [90, '#fafafa'],
  ]),
  infrared: ramp('C', 'Infrared brightness temperature', 0, [
    [-110, '#fdfdfd'],
    [-80, '#c040c0'],
    [-70, '#7a1fa0'],
    [-60, '#c01010'],
    [-50, '#f06a10'],
    [-40, '#f2e013'],
    [-30, '#2fa84f'],
    [-20, '#6fb7e8'],
    [-10, '#cfd8e2'],
    [0, '#aab3bd'],
    [10, '#808a95'],
    [20, '#59626c'],
    [30, '#323a43'],
    [40, '#0f1419'],
  ]),
  water_vapor: ramp('C', 'Water vapor brightness temperature', 0, [
    [-90, '#ffffff'],
    [-70, '#8ee0ff'],
    [-60, '#2fa0e0'],
    [-50, '#1a5fb0'],
    [-40, '#2faa6a'],
    [-30, '#9acd50'],
    [-20, '#e8d24a'],
    [-10, '#d98a3a'],
    [0, '#8a4a2a'],
  ]),
  cape: ramp('J/kg', 'CAPE', 0, [
    [100, '#fff7bc'],
    [500, '#fee391'],
    [1000, '#fec44f'],
    [2000, '#fe9929'],
    [3000, '#ec7014'],
    [4000, '#cc4c02'],
    [5000, '#8c2d04'],
  ]),
  shear: ramp('kt', 'Bulk shear', 0, [
    [20, '#d9f0d3'],
    [30, '#a6dba0'],
    [40, '#5aae61'],
    [50, '#1b7837'],
    [60, '#762a83'],
  ]),
  srh: ramp('m2/s2', 'Storm-relative helicity', 0, [
    [100, '#fff7bc'],
    [150, '#fee391'],
    [250, '#fe9929'],
    [350, '#d95f0e'],
    [500, '#993404'],
  ]),
  temperature: ramp('C', 'Temperature', 0, [
    [-40, '#4b2a8f'],
    [-30, '#3a4fc4'],
    [-20, '#2f7fe0'],
    [-10, '#5fb7ee'],
    [0, '#a9e0f4'],
    [5, '#c9ebc0'],
    [10, '#a5d96b'],
    [15, '#e8e36a'],
    [20, '#f6c23e'],
    [25, '#f08a2a'],
    [30, '#dc4a22'],
    [35, '#a61c1c'],
    [40, '#6e0f3c'],
  ]),
  precipitation: ramp('in', 'Precipitation', 2, [
    [0.01, '#c7e9c0'],
    [0.1, '#74c476'],
    [0.25, '#31a354'],
    [0.5, '#006d2c'],
    [1, '#fdae6b'],
    [2, '#e6550d'],
    [4, '#a63603'],
    [8, '#7f2704'],
  ]),
  wind: ramp('kt', 'Wind speed', 0, [
    [10, '#deebf7'],
    [20, '#9ecae1'],
    [30, '#4292c6'],
    [40, '#2171b5'],
    [50, '#08519c'],
    [60, '#6a1b9a'],
  ]),
} as const satisfies Record<string, Palette>

export type GridPaletteName = keyof typeof GRID_PALETTES
export const GRID_PALETTE_NAMES = Object.keys(GRID_PALETTES) as [
  GridPaletteName,
  ...GridPaletteName[],
]
