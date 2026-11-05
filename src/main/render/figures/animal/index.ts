// The animal disease figure kinds (spec 0460 FR-5). Importing this module registers them; the
// figures index imports it once. Ids are stable: the animal disease toolkit names them. The
// epidemic curve and tracing diagram of confirmed premises use the shared epi_curve and
// epi_contact_network kinds, fed by src/main/toolkits/animal_disease/figure-data.ts.
import { registerFigureKind } from '../registry'
import { animalMovementMapKind } from './movement-map'
import { animalInundationOverlayKind, animalPremisesMapKind } from './premises-map'
import {
  animalDepopTrackerKind,
  animalPremisesTableKind,
  animalSamplingScheduleKind,
} from './tables'

export const ANIMAL_FIGURE_KINDS = [
  animalPremisesMapKind,
  animalPremisesTableKind,
  animalMovementMapKind,
  animalDepopTrackerKind,
  animalSamplingScheduleKind,
  animalInundationOverlayKind,
] as const

registerFigureKind(animalPremisesMapKind)
registerFigureKind(animalPremisesTableKind)
registerFigureKind(animalMovementMapKind)
registerFigureKind(animalDepopTrackerKind)
registerFigureKind(animalSamplingScheduleKind)
registerFigureKind(animalInundationOverlayKind)
