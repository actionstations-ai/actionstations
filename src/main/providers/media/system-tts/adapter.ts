// System-voice provider kind (ADR-0009 fallback, #215): offline TTS through the operating
// system's speech engine. No base URL and no key; detected by looking for the executable.
import type { AdapterModule } from '../../types'
import { SystemVoiceProvider } from './provider'

export const adapter: AdapterModule = {
  kind: 'system-tts',
  createMedia: (config) => new SystemVoiceProvider(config),
}
