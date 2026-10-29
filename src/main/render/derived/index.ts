// Derived fields (spec 0432, ADR-0046): strings a template cannot compute itself because the
// helper list is fixed and packs may not add code: the SAME header, VTEC and UGC lines, CAP
// times and XML, the ICAO Q line. They are computed in main, per inject type, deterministic,
// and handed to the template as `derived.*` next to `fields` (never replacing them). A pack
// template of the same type gets the same data.
import { deriveCap } from './cap'
import { deriveNotam } from './notam-q'
import { deriveEas } from './same'
import { deriveNws } from './vtec'

type Deriver = (fields: Record<string, unknown>) => Record<string, unknown>

const DERIVERS: Record<string, Deriver> = {
  cap_alert: deriveCap,
  eas_broadcast: deriveEas,
  nws_weather_warning: deriveNws,
  notam: deriveNotam,
}

/** Derived values for an inject; {} for a type without any, and when derivation fails. */
export function deriveFields(
  type: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  try {
    return DERIVERS[type]?.(fields) ?? {}
  } catch {
    return {}
  }
}
