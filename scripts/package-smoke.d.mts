// Types for scripts/package-smoke.mjs (imported by tests/packaging/package-smoke.test.ts).
export interface FuseWire {
  version: number
  fuses: Record<string, boolean | string>
}
export interface PackagedLayout {
  executable: string
  fuseBinary: string
  resources: string
  infoPlist?: string
}
export declare const FUSE_SENTINEL: string
export declare const FUSE_NAMES: string[]
export declare const EXPECTED_FUSES: Record<string, boolean>
export declare const ALLOWED_ASAR_ROOTS: string[]
export declare function readFuseWires(binary: Buffer): FuseWire[]
export declare function fuseProblems(wire: FuseWire, expected?: Record<string, boolean>): string[]
export declare function asarFileList(headerJson: string): string[]
export declare function asarLeaks(files: string[]): string[]
export declare function packedNativeLibs(headerJson: string): string[]
export declare function foreignBinaries(
  files: string[],
  platform?: NodeJS.Platform,
  arch?: string,
): string[]
export declare function readAsarHeader(asarPath: string): string
export declare function packagedLayout(appPath: string, platform?: NodeJS.Platform): PackagedLayout
export declare function killLeftovers(executable: string): string[]
export declare function bundledPackProblems(resources: string): string[]
export declare function surveyTemplateProblems(resources: string): string[]
