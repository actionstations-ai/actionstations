// Types for scripts/make-badges.mjs (imported by tests/scripts/make-badges.test.ts).
export interface BadgeFacts {
  unitTests: number
  e2eTests: number
  e2eFiles: number
  version: string
  license: string
  electron: string
  platforms: string
}
export type BadgeValues = Record<string, string>
export const COLORS: Record<'label' | 'green' | 'blue' | 'orange' | 'grey', string>
export function textWidth(text: string): number
export function escapeXml(text: string): string
export function renderBadge(badge: { label: string; message: string; color: string }): string
export function parseVitestPassed(log: string): number | null
export function parsePlaywrightList(out: string): { tests: number; files: number } | null
export function licenseName(packageLicense: string | undefined): string
export function platformsFrom(builderYml: string): string
export function badgeValues(facts: BadgeFacts): BadgeValues
export function buildBadgeFiles(
  values: BadgeValues,
  previous: { ciDate: string; values: BadgeValues } | null,
  today: string,
): Record<string, string>
export function writeChanged(outDir: string, files: Record<string, string>): string[]
export function badgeVersion(args: { version?: string }, pkg: { version: string }): string
