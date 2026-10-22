// Types for scripts/check-contrast.mjs (imported by tests/scripts/check-contrast.test.ts).
export type Pair = [fg: string, bg: string, min: number, where: string]
export type Tokens = Record<string, string>
export interface Themes {
  light: Tokens
  dark: Tokens
  darkAttr: Tokens
}
export const TEXT_MIN: number
export const UI_MIN: number
export const CONTEXT_PAIRS: Pair[]
export function hexToRgb(hex: string): [number, number, number]
export function contrastRatio(a: string, b: string): number
export function readThemes(css?: string): Themes
export function rulePairs(files?: string[]): Pair[]
export function contrastViolations(
  themes?: Record<string, Tokens> | Themes,
  pairs?: Pair[],
): string[]
export function darkThemeDrift(themes?: Themes): string[]
