// Types for scripts/simulate-names.mjs (#283).
export const NAMES_FILE: string
export type NamePair = [RegExp, string]
export function loadNames(file?: string): NamePair[]
export function simulateNames(text: string, names?: NamePair[]): string
export function simulateFiles(paths: string[], names?: NamePair[]): string[]
