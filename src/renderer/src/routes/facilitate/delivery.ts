// How an inject reaches the room when the facilitator delivers it, and which media file to
// show. Shared by the facilitate route (thumbnails, actions) and the present route.
import type { Inject } from '@shared/schemas/inject'
import type { MediaAsset } from '@shared/schemas/media'

export type DeliveryAction =
  | { kind: 'present'; asset: MediaAsset }
  | { kind: 'play'; asset: MediaAsset }
  | { kind: 'hand'; asset?: MediaAsset }
  | { kind: 'read' }
  | { kind: 'none' }

// Template output is the exact, legible page; a composite has the AI scene placed in it.
const IMAGE_ROLE_ORDER: MediaAsset['role'][] = ['composite', 'rendered', 'generated', 'source']

const byRole = (a: MediaAsset, b: MediaAsset) =>
  IMAGE_ROLE_ORDER.indexOf(a.role) - IMAGE_ROLE_ORDER.indexOf(b.role)

export function imageAsset(inject: Inject | undefined): MediaAsset | undefined {
  return inject?.assets.filter((a) => a.kind === 'image').sort(byRole)[0]
}

export const audioAsset = (inject: Inject | undefined): MediaAsset | undefined =>
  inject?.assets.find((a) => a.kind === 'audio')

export const videoAsset = (inject: Inject | undefined): MediaAsset | undefined =>
  inject?.assets.find((a) => a.kind === 'video')

/** What the projector shows for an inject: video, else the page image, else its audio. */
export function screenAsset(inject: Inject | undefined): MediaAsset | undefined {
  return videoAsset(inject) ?? imageAsset(inject) ?? audioAsset(inject)
}

/** Media for the present route: the requested asset if it exists, else the default. */
export function presentAsset(inject: Inject | undefined, assetId?: string | null) {
  const requested = assetId ? inject?.assets.find((a) => a.id === assetId) : undefined
  return (
    requested ??
    (inject?.deliveryMode === 'play_audio' ? audioAsset(inject) : undefined) ??
    screenAsset(inject)
  )
}

/** The printable page for a hand-out: the PDF when the template is paper, else the image. */
export function pageAsset(inject: Inject | undefined): MediaAsset | undefined {
  return inject?.assets.find((a) => a.kind === 'pdf') ?? imageAsset(inject)
}

export function deliveryAction(inject: Inject | undefined): DeliveryAction {
  if (!inject) return { kind: 'none' }
  switch (inject.deliveryMode) {
    case 'display_main_screen': {
      const asset = videoAsset(inject) ?? imageAsset(inject)
      return asset ? { kind: 'present', asset } : { kind: 'none' }
    }
    case 'play_audio': {
      const asset = audioAsset(inject)
      return asset ? { kind: 'play', asset } : { kind: 'read' }
    }
    case 'hand_to_role': {
      const asset = pageAsset(inject)
      return asset ? { kind: 'hand', asset } : { kind: 'hand' }
    }
    case 'read_aloud':
      return { kind: 'read' }
  }
}

export const DELIVERY_LABEL: Record<Inject['deliveryMode'], string> = {
  display_main_screen: 'Main screen',
  play_audio: 'Play audio',
  hand_to_role: 'Hand to role',
  read_aloud: 'Read aloud',
}
