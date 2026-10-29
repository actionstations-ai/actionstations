export interface PublicManifest {
  playerBundleSha256: string
  files: string[]
  source: string
}
export function listFiles(dir: string, base?: string): string[]
export function bundleHash(dir: string, files: string[]): string
export function buildPublic(options?: { publicDir?: string; playerDir?: string }): PublicManifest
