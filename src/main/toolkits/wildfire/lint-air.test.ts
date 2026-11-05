// Air quality and power shutoff checks (spec 0461 FR-6), with the notification windows helper.
import { describe, expect, it } from 'vitest'
import { aqiCategory, lintAqiClaims, lintAqiPair, lintAqiRange, pm25Category } from './lint-air'
import { lintMedicalBaselineCounts, lintPartnerNoticeTiming } from './lint-shutoff'
import { checkAtDeenergization, checkWindow, DEFAULT_WINDOWS } from './windows'

describe('AQI categories', () => {
  it('puts every AQI breakpoint in its category', () => {
    expect([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301, 500].map(aqiCategory)).toEqual([
      'Good',
      'Good',
      'Moderate',
      'Moderate',
      'Unhealthy for Sensitive Groups',
      'Unhealthy for Sensitive Groups',
      'Unhealthy',
      'Unhealthy',
      'Very Unhealthy',
      'Very Unhealthy',
      'Hazardous',
      'Hazardous',
    ])
  })
  it('uses the PM2.5 breakpoints in effect since 6 May 2024', () => {
    expect(
      [0, 9.0, 9.1, 35.4, 35.5, 55.4, 55.5, 125.4, 125.5, 225.4, 225.5, 300].map(pm25Category),
    ).toEqual([
      'Good',
      'Good',
      'Moderate',
      'Moderate',
      'Unhealthy for Sensitive Groups',
      'Unhealthy for Sensitive Groups',
      'Unhealthy',
      'Unhealthy',
      'Very Unhealthy',
      'Very Unhealthy',
      'Hazardous',
      'Hazardous',
    ])
  })
})

describe('AQI checks', () => {
  it('flags an AQI and category that disagree, and a PM2.5 that disagrees', () => {
    expect(lintAqiPair({ aqi: 168, category: 'Moderate' })).toHaveLength(1)
    expect(lintAqiPair({ aqi: 168, category: 'Unhealthy', pm25: 20 })).toHaveLength(1)
    expect(lintAqiPair({ aqi: 168, category: 'Unhealthy', pm25: 78.4 })).toEqual([])
  })
  it('checks claims in running text and ignores a range', () => {
    expect(lintAqiClaims('The AQI of 168 (Moderate) rose overnight.')).toHaveLength(1)
    expect(lintAqiClaims('The AQI reached 168, Unhealthy, by noon.')).toEqual([])
    expect(lintAqiClaims('AQI 151 to 200 (PM2.5) is forecast.')).toEqual([])
  })
  it('requires the highest AQI in a range to match the stated category', () => {
    expect(lintAqiRange('AQI 151 to 200 (PM2.5)', 'Unhealthy')).toEqual([])
    expect(lintAqiRange('AQI 151 to 260', 'Unhealthy')).toHaveLength(1)
  })
})

describe('power shutoff checks', () => {
  it('flags a partner notice outside the 48-72 hour window', () => {
    expect(lintPartnerNoticeTiming(60)).toEqual([])
    expect(lintPartnerNoticeTiming(30)).toHaveLength(1)
    expect(lintPartnerNoticeTiming(80)).toHaveLength(1)
  })
  it('flags medical baseline counts that cannot be true', () => {
    expect(lintMedicalBaselineCounts({ customers: 175, attempted: 175, reached: 148 })).toEqual([])
    expect(
      lintMedicalBaselineCounts({ customers: 100, attempted: 120, reached: 130 }),
    ).toHaveLength(2)
  })
})

describe('notification windows', () => {
  const deenergize = Date.parse('2026-10-10T18:04:00-07:00')
  const hoursBefore = (h: number) => deenergize - h * 3_600_000
  const [partners, customers, shortNotice] = DEFAULT_WINDOWS
  it('lists the three timed windows of the example rule', () => {
    expect(DEFAULT_WINDOWS.map((w) => w.label)).toEqual([
      '48-72 hours before',
      '24-48 hours before',
      '1-4 hours before',
    ])
  })
  it('judges a notice against its window', () => {
    expect(checkWindow(partners!, hoursBefore(60), deenergize).met).toBe(true)
    expect(checkWindow(partners!, hoursBefore(40), deenergize).met).toBe(false)
    expect(checkWindow(customers!, hoursBefore(25), deenergize).met).toBe(true)
    expect(checkWindow(shortNotice!, hoursBefore(0.3), deenergize).met).toBe(false)
    expect(checkWindow(shortNotice!, hoursBefore(2), deenergize).met).toBe(true)
  })
  it('accepts the power-off notice within 30 minutes after de-energization', () => {
    expect(checkAtDeenergization(deenergize + 6 * 60_000, deenergize).met).toBe(true)
    expect(checkAtDeenergization(deenergize + 45 * 60_000, deenergize).met).toBe(false)
  })
})
