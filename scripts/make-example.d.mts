// Types for the testable parts of scripts/make-example.mjs (tests/scripts/make-example.test.ts).
export interface AssetLike {
  id: string
  kind: string
  role: string
  path: string
  width?: number
  height?: number
  durationSec?: number
}
export interface InjectLike {
  id: string
  mselRowId: string
  type: string
  assets: AssetLike[]
}
export interface RowLike {
  id: string
  purposeTag: string
}
export interface ScenarioLike {
  id: string
  title: string
  msel: RowLike[]
  brief?: { threatFamily?: string }
  overview?: { threat?: string }
}
export interface Bundle {
  id: string
  dir?: string
  scenario: ScenarioLike
  injects: InjectLike[]
}
export type SeedDocument = string | { file: string; section?: string }
export interface BuildSpec {
  id: string
  title: string
  domainProfile: string
  summary: string
  notice: string
  project: { name: string; orgName?: string; orgType?: string; brand?: unknown }
  documents: { dir: string; exclude?: string[] }
  media?: { aiImagesPerScenario?: number; ttsPerScenario?: number }
  scenarios: {
    key: string
    threatFamily: string
    summary?: string
    userPrompt?: string
    seed?: { scenario: string; documents?: Record<string, SeedDocument | SeedDocument[]> }
  }[]
}
export interface ExampleManifest {
  id: string
  title: string
  domainProfile: string
  summary: string
  fictional: true
  notice: string
  scenarios: { id: string; title: string; threatFamily: string; summary: string }[]
}
export interface ShippedPng {
  buffer: Buffer
  width: number
  height: number
}

export function isDerived(rel: string): boolean
export function findLeaks(text: string): string[]
export function leaksIn(dest: string): string[]
export function scrub<T>(value: T, absolute: string[]): T
export function shippedPng(buffer: Buffer): ShippedPng
export function chooseAssets(
  projectDir: string,
  scenarios: Bundle[],
  reserved?: number,
): { kept: Map<string, ShippedPng>; total: number }
export function packageProject(
  spec: BuildSpec,
  out: string,
  dest?: string,
): { files: number; kept: number; mediaBytes: number; bundles: Bundle[]; clip?: string }
export function writeManifest(
  spec: BuildSpec,
  out: string,
  bundles: Bundle[],
  dir?: string,
): ExampleManifest

export interface TreeDiff {
  changed: string[]
  added: string[]
  removed: string[]
  identical: number
}
export function hashTree(dir: string): Map<string, string>
export function treeDiff(before: Map<string, string>, after: Map<string, string>): TreeDiff

export interface WarningLike {
  code: string
  severity: string
  message: string
  rowId?: string
  injectId?: string
}
export function blockingWarnings<T extends WarningLike>(stored: T[], recomputed?: T[]): T[]
export function markdownSection(md: string, heading: string): string
export function seedMarkdown(value: unknown, root?: string): string
export function shippedMp3(wav: Buffer): Buffer
export function chooseClip(
  projectDir: string,
  scenarios: Bundle[],
): { asset: AssetLike; buffer: Buffer } | undefined
export function injectContent(inject: unknown): string
export function scenarioContent(scenario: unknown): string
export function assertNoRewrite(result: unknown, key: string): void
