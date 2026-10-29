// What may be in an .asexercise archive (spec 0440 FR-9). The writer calls assertShareable
// before it zips; the reader refuses any other path. Field-level limits are the strict zod
// schemas in src/shared/schemas/regional.ts (Frame, Slice, SharedRow, SharedInject).
import { OrgPrefix } from '@shared/schemas/regional'

export const BUNDLE_FILE = 'bundle.json'
export const SIGNATURE_FILE = 'signature.json'
export const FRAME_FILE = 'frame.json'
export const sliceFile = (prefix: string): string => `slices/${prefix}.json`
export const mediaPath = (prefix: string, injectId: string, assetId: string, ext: string): string =>
  `media/${prefix}/${injectId}/${assetId}.${ext}`

const SLICE_PATH = /^slices\/([A-Z]{2,6})\.json$/
const MEDIA_PATH =
  /^media\/([A-Z]{2,6})\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\/[A-Za-z0-9][A-Za-z0-9_-]{0,127}\.(png|jpg|jpeg|webp|mp4|webm|wav|mp3|pdf)$/

export const MEDIA_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm', 'wav', 'mp3', 'pdf']

export type AllowedPath =
  { type: 'bundle' | 'signature' | 'frame' } | { type: 'slice' | 'media'; prefix: string }

/** Classify an archive path, or undefined when nothing may be stored there. */
export function classifyPath(path: string): AllowedPath | undefined {
  if (path === BUNDLE_FILE) return { type: 'bundle' }
  if (path === SIGNATURE_FILE) return { type: 'signature' }
  if (path === FRAME_FILE) return { type: 'frame' }
  const slice = SLICE_PATH.exec(path)
  if (slice && OrgPrefix.safeParse(slice[1]).success) return { type: 'slice', prefix: slice[1]! }
  const media = MEDIA_PATH.exec(path)
  if (media) return { type: 'media', prefix: media[1]! }
  return undefined
}

export class ShareError extends Error {}

/** Throws on the first path that may not leave the organization. */
export function assertShareable(paths: Iterable<string>): void {
  for (const p of paths)
    if (!classifyPath(p)) throw new ShareError(`"${p}" may not be included in an exercise bundle`)
}
