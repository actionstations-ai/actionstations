// Sounding figure data from an Iowa Environmental Mesonet radiosonde profile (NWS upper-air
// reports): levels with a height and a temperature or a wind, in the figure's own shape.
import type { SoundingData } from '../../render/figures/weather/sounding'

interface RaobLevel {
  pres: number
  hght: number | null
  tmpc: number | null
  dwpc: number | null
  drct: number | null
  sknt: number | null
}

export function raobToSounding(json: string, name: string): SoundingData {
  const profile = JSON.parse(json).profiles[0] as {
    station: string
    valid: string
    profile: RaobLevel[]
  }
  const opt = <T>(v: T | null): T | undefined => (v === null ? undefined : v)
  const levels = profile.profile
    .filter((l) => l.hght !== null && l.pres <= 1050 && (l.tmpc !== null || l.drct !== null))
    .map((l) => ({
      pressureHpa: l.pres,
      heightM: l.hght!,
      tempC: opt(l.tmpc),
      dewpointC: opt(l.dwpc),
      windDirDeg: opt(l.drct),
      windSpeedKt: opt(l.sknt),
    }))
  return {
    origin: 'historical',
    station: { id: profile.station, name },
    time: profile.valid.replace('Z', '+00:00'),
    levels: levels.map((l) =>
      Object.fromEntries(Object.entries(l).filter(([, v]) => v !== undefined)),
    ) as SoundingData['levels'],
  }
}
