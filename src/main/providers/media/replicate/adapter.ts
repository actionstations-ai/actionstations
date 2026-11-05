// Replicate provider kind: cloud image and video generation through Replicate's predictions API.
import type { AdapterModule } from '../../types'
import { ReplicateMediaProvider } from './provider'

export const adapter: AdapterModule = {
  kind: 'replicate',
  createMedia: (config, secret) => new ReplicateMediaProvider(config, secret),
}
