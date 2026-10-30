// Places in generation (#500, spec 0436 FR-6): the place labels a msel_phase call may use, the
// repair that drops place ids the project does not have, and a rule pass that fills a row's
// places when its event text names a place (or its fact entry) exactly (`matchPlaces`). No
// model call.
import { MAX_ROW_PLACES, matchPlaces } from '@shared/maps/pins'
import type { Place } from '@shared/schemas'

/** At most this many place labels go into a prompt, fact-linked places first. */
export const MAX_PROMPT_PLACES = 60

export interface PlaceLabel {
  id: string
  label: string
}

/** The labels a msel_phase call receives: fact-linked places first, then the rest, up to 60. */
export function placeLabels(places: readonly Place[]): PlaceLabel[] {
  const linked = places.filter((p) => p.factRef)
  const rest = places.filter((p) => !p.factRef)
  return [...linked, ...rest].slice(0, MAX_PROMPT_PLACES).map((p) => ({ id: p.id, label: p.label }))
}

/** Keep only ids that are places of this project, once each, at most five. */
export function knownPlaceIds(
  ids: readonly string[] | undefined,
  places: readonly Place[],
): string[] {
  const known = new Set(places.map((p) => p.id))
  return [...new Set((ids ?? []).filter((id) => known.has(id)))].slice(0, MAX_ROW_PLACES)
}

/** Ids for one generated row: the model's known ids, or the places its event text names. */
export function placeIdsFor(
  modelIds: readonly string[] | undefined,
  event: string,
  places: readonly Place[],
): string[] {
  const fromModel = knownPlaceIds(modelIds, places)
  return fromModel.length ? fromModel : matchPlaces(event, [...places])
}
