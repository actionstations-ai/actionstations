import type { MediaCallCounts } from '@shared/ipc/media-confirm'

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** "3 images, 1 video, 2 audio clips" for the kinds that have calls. */
export function describeCounts(c: MediaCallCounts, upTo = false): string {
  const text = [
    c.image ? plural(c.image, 'image', 'images') : '',
    c.video ? plural(c.video, 'video', 'videos') : '',
    c.audio ? plural(c.audio, 'audio clip', 'audio clips') : '',
  ]
    .filter(Boolean)
    .join(', ')
  return upTo && text ? `up to ${text}` : text
}

export const formatUsd = (usd: number): string => `$${usd.toFixed(2)}`
