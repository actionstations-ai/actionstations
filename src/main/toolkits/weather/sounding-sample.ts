// Sounding figure data from the recorded upper-air observation (KILN, 7 May 2024, 12Z, as
// served by the Iowa Environmental Mesonet from the NWS radiosonde reports).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SoundingData } from '../../render/figures/weather/sounding'
import { raobToSounding } from './sounding-data'

export const RAOB_FIXTURE = join(
  __dirname,
  '../../../../tests/fixtures/weather/KILN_20240507_12Z_raob.json',
)

export const sampleSounding = (): SoundingData =>
  raobToSounding(readFileSync(RAOB_FIXTURE, 'utf8'), 'Wilmington OH')
