// Built-in Whisper speech to text (#425). Runs on this computer only.
import type { AdapterModule } from '../../types'
import { LocalWhisperProvider } from './provider'

export const adapter: AdapterModule = {
  kind: 'local-whisper',
  createSpeechToText: (config) => new LocalWhisperProvider(config),
}
