import type { MediaCallCounts } from '@shared/ipc/media-confirm'

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** "3 images, 1 video, 2 audio clips" for the kinds that have calls. */
export function describeCounts(c: MediaCallCounts): string {
  return [
    c.image ? plural(c.image, 'image', 'images') : '',
    c.video ? plural(c.video, 'video', 'videos') : '',
    c.audio ? plural(c.audio, 'audio clip', 'audio clips') : '',
  ]
    .filter(Boolean)
    .join(', ')
}

export const formatUsd = (usd: number): string => `$${usd.toFixed(2)}`
