// The part of GitHub's "latest release" answer the update check reads (#442), and its
// conversion to the LatestRelease the app stores. Everything else in the answer is ignored.
import { z } from 'zod'
import { IsoDateTime } from '@shared/schemas/common'
import { SemVer } from '@shared/schemas/pack'
import type { LatestRelease } from '@shared/schemas/settings'
import { AppError } from '../lib/errors'

export const RELEASES_REPO = 'actionstations-ai/actionstations'
const RELEASE_PATH = `/${RELEASES_REPO}/releases/`

const GitHubAsset = z.looseObject({
  name: z.string(),
  size: z.number().int().nonnegative(),
})

export const GitHubRelease = z.looseObject({
  tag_name: z.string().max(100),
  name: z.string().nullish(),
  html_url: z.string().max(2048),
  published_at: z.string().nullish(),
  body: z.string().nullish(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z.array(GitHubAsset).default([]),
})

/** A release page of this repository on github.com, over https, with nothing else in the URL. */
export function isReleasePageUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  return (
    u.protocol === 'https:' &&
    u.hostname === 'github.com' &&
    u.port === '' &&
    !u.username &&
    !u.password &&
    u.pathname.startsWith(RELEASE_PATH) &&
    u.pathname.length > RELEASE_PATH.length
  )
}

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

/** Validate GitHub's answer and keep what the app shows. Throws PROVIDER on anything odd. */
export function toLatestRelease(json: unknown): LatestRelease {
  const parsed = GitHubRelease.safeParse(json)
  if (!parsed.success) throw unexpected('it is not a release')
  const r = parsed.data
  if (r.draft || r.prerelease) throw unexpected('the release is a draft or a prerelease')
  const version = r.tag_name.replace(/^v/, '')
  if (!SemVer.safeParse(version).success) throw unexpected(`the tag ${cap(r.tag_name, 40)}`)
  if (!isReleasePageUrl(r.html_url)) throw unexpected('the release page is not on github.com')
  const publishedAt = IsoDateTime.safeParse(r.published_at)
  if (!publishedAt.success) throw unexpected('the release has no publication date')
  return {
    version,
    name: cap(r.name?.trim() || `Action Stations ${version}`, 200),
    publishedAt: publishedAt.data,
    url: r.html_url,
    notes: cap(r.body ?? '', 50_000),
    assets: r.assets.slice(0, 50).map((a) => ({ name: cap(a.name, 200), size: a.size })),
  }
}

function unexpected(why: string): AppError {
  return new AppError('PROVIDER', `GitHub sent an answer the app could not use (${why})`)
}
