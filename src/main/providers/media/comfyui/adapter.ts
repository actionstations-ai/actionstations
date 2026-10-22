// ComfyUI provider kind: image, image-to-video and optional TTS through API-format workflows
// (comfy/workflows/ defaults, user imports) with bindings from the inject's media brief.
import type { AdapterModule } from '../../types'
import { ComfyMediaProvider } from './provider'

export const adapter: AdapterModule = {
  kind: 'comfyui',
  createMedia: (config) => new ComfyMediaProvider(config),
  localDefaults: [{ label: 'ComfyUI', baseUrl: 'http://127.0.0.1:8188' }],
}
