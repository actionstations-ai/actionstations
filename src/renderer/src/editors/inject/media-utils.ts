// Small helpers about an inject's media, shared by the deck and the editor.
import type { MediaAsset } from '@shared/schemas/media'

const SLOT_ID = /^([a-z][a-z0-9_]*)-([0-9A-HJKMNP-TV-Z]{26})$/

/** The template slot an AI image fills, from its id (`photo-01J…` → "photo"); see render/inject.ts. */
export function slotOfAsset(id: string): string | undefined {
  return SLOT_ID.exec(id)?.[1]
}

const TEMPLATE_ROLES: MediaAsset['role'][] = ['composite', 'rendered']

/** The image to show for an inject: its latest template render, else its AI image. */
export function thumbnailOf(assets: readonly MediaAsset[]): MediaAsset | undefined {
  const images = assets.filter((a) => a.kind === 'image')
  return (
    images.filter((a) => TEMPLATE_ROLES.includes(a.role)).at(-1) ??
    images.filter((a) => a.role === 'generated').at(-1)
  )
}

export const hasKind = (assets: readonly MediaAsset[], kind: MediaAsset['kind']): boolean =>
  assets.some((a) => a.kind === kind)

export const RENDER_PATHS = ['template', 'ai_image', 'ai_video', 'tts'] as const
export type RenderPathId = (typeof RENDER_PATHS)[number]

export const RENDER_PATH_LABEL: Record<RenderPathId, string> = {
  template: 'Template render (PNG/PDF)',
  ai_image: 'AI image',
  ai_video: 'AI video',
  tts: 'Voice (TTS)',
}
