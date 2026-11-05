// ElevenLabs (cloud): speech for the Audio task, with an optional sound-effect bed. Always a
// cloud provider; the key is required. Calls go through the outbound gate like Anthropic's.
import type { AdapterModule } from '../../types'
import { ElevenLabsProvider } from './provider'

export const adapter: AdapterModule = {
  kind: 'elevenlabs',
  createMedia: (config, secret) => new ElevenLabsProvider(config, secret),
}
