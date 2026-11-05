// Sounding figure data from the recorded upper-air observation (KILN, 7 May 2024, 12Z, as
// served by the Iowa Environmental Mesonet from the NWS radiosonde reports).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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

export const RAOB_FIXTURE = join(
  __dirname,
  '../../../../tests/fixtures/weather/KILN_20240507_12Z_raob.json',
)

export const sampleSounding = (): SoundingData =>
  raobToSounding(readFileSync(RAOB_FIXTURE, 'utf8'), 'Wilmington OH')
