// Types for scripts/repo-stats.mjs (imported by tests/scripts/repo-stats.test.ts).
export interface Snapshot {
  date: string
  downloads: number
  stars: number
  forks: number
}
export type Ledger = Record<string, { carried: number; last: number }>
export interface Release {
  tag_name: string
  assets?: { name: string; download_count: number }[]
}
export const REPO: string
export const INSTALLER_RE: RegExp
export const THEMES: Record<'light' | 'dark', Record<string, unknown>>
export function installerCounts(releases: Release[]): Record<string, number>
export function updateLedger(ledger: Ledger, counts: Record<string, number>): Ledger
export function ledgerTotal(ledger: Ledger): number
export function addSnapshot(snapshots: Snapshot[], snapshot: Snapshot): Snapshot[]
export function niceScale(max: number): { max: number; step: number }
export function shortDate(iso: string): string
export function spreadLabels<T extends { y: number }>(labels: T[], gap?: number): T[]
export function renderChart(snapshots: Snapshot[], theme: 'light' | 'dark'): string
export function emptyHistory(): { repo: string; assets: Ledger; snapshots: Snapshot[] }
export function fetchStats(repo?: string): {
  stars: number
  forks: number
  counts: Record<string, number>
}
