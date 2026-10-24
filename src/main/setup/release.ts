// Reading a GitHub "latest release" listing (ADR-0021): an asset's download URL and the
// sha256 digest GitHub computed for it. Only fields are read; nothing here fetches.
import { AppError } from '../lib/errors'

export interface Resolved {
  url: string
  sha256?: string
}

/** The asset URL and sha256 digest from a GitHub "latest release" listing. */
export function githubAsset(release: unknown, name: string): Resolved {
  const assets = (release as { assets?: unknown })?.assets
  const asset = Array.isArray(assets)
    ? (assets as { name?: unknown; browser_download_url?: unknown; digest?: unknown }[]).find(
        (a) => a?.name === name,
      )
    : undefined
  if (!asset || typeof asset.browser_download_url !== 'string')
    throw new AppError(
      'PROVIDER',
      `The vendor's latest release has no ${name}; use "Open the download page".`,
    )
  const digest =
    typeof asset.digest === 'string' ? /^sha256:([0-9a-f]{64})$/i.exec(asset.digest) : null
  return {
    url: asset.browser_download_url,
    ...(digest?.[1] ? { sha256: digest[1].toLowerCase() } : {}),
  }
}

/** The release's tag ("v0.40.11"), for messages; empty when absent. */
export const releaseTag = (release: unknown): string => {
  const tag = (release as { tag_name?: unknown })?.tag_name
  return typeof tag === 'string' ? tag.slice(0, 40) : ''
}
