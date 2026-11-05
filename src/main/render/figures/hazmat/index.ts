// Hazmat figure kinds (spec 0456 FR-6). Importing this module registers them.
import { registerFigureKind } from '../registry'
import { protectiveActionZoneKind } from './protective-action-zone'

registerFigureKind(protectiveActionZoneKind)

export { protectiveActionZoneKind }
export * from './geometry'
