// "Cloud: sends excerpts to <host>" on providers and routing rows (#433, FR-17).
import { isRemoteProvider } from '@shared/provider-network'
import { Badge } from '../ui'
import { cloudMarkerText, type MarkerConfig } from './privacy-model'

export function CloudMarker({ config }: { config: MarkerConfig }) {
  const text = cloudMarkerText(config)
  if (!text) return null
  return <Badge tone={isRemoteProvider(config) ? 'warn' : 'info'}>{text}</Badge>
}
