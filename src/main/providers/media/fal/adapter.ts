// fal.ai provider kind: cloud image and video generation through fal's queue API.
import type { AdapterModule } from '../../types'
import { FalMediaProvider } from './provider'

export const adapter: AdapterModule = {
  kind: 'fal',
  createMedia: (config, secret) => new FalMediaProvider(config, secret),
}
