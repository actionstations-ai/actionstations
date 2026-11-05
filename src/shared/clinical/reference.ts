// Reference value ranges for the clinical systems toolkit (spec 0451 FR-9). Plausible adult
// laboratory and vital-sign ranges so synthetic results look right and flags agree with values.
// These are commonly published adult ranges rounded for exercise use: they differ between
// laboratories and are not a clinical reference. Exercise content only.

export interface LabRange {
  id: string
  name: string
  unit: string
  low: number
  high: number
  /** Values at or beyond these are critical (phoned). Absent when the test has none. */
  criticalLow?: number
  criticalHigh?: number
  /** Decimal places a result prints with. */
  decimals: number
}

export const LAB_RANGES: readonly LabRange[] = [
  {
    id: 'sodium',
    name: 'Sodium',
    unit: 'mmol/L',
    low: 135,
    high: 145,
    criticalLow: 120,
    criticalHigh: 160,
    decimals: 0,
  },
  {
    id: 'potassium',
    name: 'Potassium',
    unit: 'mmol/L',
    low: 3.5,
    high: 5.1,
    criticalLow: 2.5,
    criticalHigh: 6.0,
    decimals: 1,
  },
  { id: 'chloride', name: 'Chloride', unit: 'mmol/L', low: 98, high: 107, decimals: 0 },
  {
    id: 'bicarbonate',
    name: 'Bicarbonate',
    unit: 'mmol/L',
    low: 22,
    high: 29,
    criticalLow: 10,
    decimals: 0,
  },
  { id: 'bun', name: 'Urea nitrogen', unit: 'mg/dL', low: 7, high: 20, decimals: 0 },
  { id: 'creatinine', name: 'Creatinine', unit: 'mg/dL', low: 0.7, high: 1.3, decimals: 1 },
  {
    id: 'glucose',
    name: 'Glucose',
    unit: 'mg/dL',
    low: 70,
    high: 99,
    criticalLow: 40,
    criticalHigh: 500,
    decimals: 0,
  },
  {
    id: 'hemoglobin',
    name: 'Hemoglobin',
    unit: 'g/dL',
    low: 12.0,
    high: 17.5,
    criticalLow: 7.0,
    decimals: 1,
  },
  {
    id: 'wbc',
    name: 'White blood cells',
    unit: 'x10^9/L',
    low: 4.0,
    high: 11.0,
    criticalLow: 2.0,
    criticalHigh: 30.0,
    decimals: 1,
  },
  {
    id: 'platelets',
    name: 'Platelets',
    unit: 'x10^9/L',
    low: 150,
    high: 400,
    criticalLow: 20,
    decimals: 0,
  },
  { id: 'inr', name: 'INR', unit: '', low: 0.9, high: 1.1, criticalHigh: 5.0, decimals: 1 },
]

export interface VitalRange {
  id: string
  name: string
  unit: string
  low: number
  high: number
}

export const VITAL_RANGES: readonly VitalRange[] = [
  { id: 'heart_rate', name: 'Pulse', unit: '/min', low: 60, high: 100 },
  { id: 'resp_rate', name: 'Respirations', unit: '/min', low: 12, high: 20 },
  { id: 'systolic', name: 'Systolic BP', unit: 'mmHg', low: 100, high: 140 },
  { id: 'diastolic', name: 'Diastolic BP', unit: 'mmHg', low: 60, high: 90 },
  { id: 'temperature', name: 'Temperature', unit: 'C', low: 36.1, high: 37.8 },
  { id: 'spo2', name: 'SpO2', unit: '%', low: 94, high: 100 },
]

export const labRange = (id: string): LabRange => {
  const r = LAB_RANGES.find((x) => x.id === id)
  if (!r) throw new Error(`Unknown lab ${id}`)
  return r
}

export type ResultFlag = '' | 'abnormal' | 'critical'

/** The flag a value earns against its range. */
export function flagFor(range: LabRange, value: number): ResultFlag {
  if (
    (range.criticalLow !== undefined && value <= range.criticalLow) ||
    (range.criticalHigh !== undefined && value >= range.criticalHigh)
  )
    return 'critical'
  return value < range.low || value > range.high ? 'abnormal' : ''
}

export const formatReference = (r: LabRange): string =>
  `${r.low.toFixed(r.decimals)} - ${r.high.toFixed(r.decimals)}`
