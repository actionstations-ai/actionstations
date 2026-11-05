// Air quality format checks (spec 0461 FR-6): the EPA Air Quality Index categories and the PM2.5
// breakpoints in effect since 6 May 2024 (Good 0.0-9.0, Moderate 9.1-35.4, Unhealthy for
// Sensitive Groups 35.5-55.4, Unhealthy 55.5-125.4, Very Unhealthy 125.5-225.4, Hazardous
// 225.5 and above, in micrograms per cubic meter). Pure functions over plain data.

export const AQI_CATEGORIES = [
  'Good',
  'Moderate',
  'Unhealthy for Sensitive Groups',
  'Unhealthy',
  'Very Unhealthy',
  'Hazardous',
] as const
export type AqiCategory = (typeof AQI_CATEGORIES)[number]

export interface AirLintIssue {
  rule: 'aqi_category'
  message: string
}

/** The category an AQI value (0 to 500) falls in. */
export function aqiCategory(aqi: number): AqiCategory {
  if (aqi <= 50) return 'Good'
  if (aqi <= 100) return 'Moderate'
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups'
  if (aqi <= 200) return 'Unhealthy'
  if (aqi <= 300) return 'Very Unhealthy'
  return 'Hazardous'
}

/** The category of a PM2.5 concentration in micrograms per cubic meter. */
export function pm25Category(ugm3: number): AqiCategory {
  if (ugm3 < 9.1) return 'Good'
  if (ugm3 < 35.5) return 'Moderate'
  if (ugm3 < 55.5) return 'Unhealthy for Sensitive Groups'
  if (ugm3 < 125.5) return 'Unhealthy'
  if (ugm3 < 225.5) return 'Very Unhealthy'
  return 'Hazardous'
}

/** An AQI value with its category name, and the PM2.5 concentration when the row has one. */
export function lintAqiPair(input: {
  aqi: number
  category: string
  pm25?: number
}): AirLintIssue[] {
  const issues: AirLintIssue[] = []
  const expected = aqiCategory(input.aqi)
  if (input.category !== expected)
    issues.push({
      rule: 'aqi_category',
      message: `AQI ${input.aqi} is ${expected}, not ${input.category}.`,
    })
  if (input.pm25 !== undefined && pm25Category(input.pm25) !== input.category)
    issues.push({
      rule: 'aqi_category',
      message: `${input.pm25} ug/m3 of PM2.5 is ${pm25Category(input.pm25)}, not ${input.category}.`,
    })
  return issues
}

const CATEGORY_WORDS =
  'Unhealthy for Sensitive Groups|Very Unhealthy|Unhealthy|Hazardous|Moderate|Good'

/** "AQI 168 (Unhealthy)" style claims in running text, checked against the breakpoints. */
export function lintAqiClaims(text: string): AirLintIssue[] {
  const issues: AirLintIssue[] = []
  const re = new RegExp(`\\bAQI\\s*(?:of\\s*)?(\\d{1,3})\\b[^.\\n]{0,12}?(${CATEGORY_WORDS})`, 'gi')
  for (const m of text.matchAll(re)) {
    const aqi = Number(m[1])
    const said = AQI_CATEGORIES.find((c) => c.toLowerCase() === (m[2] ?? '').toLowerCase())
    if (said && aqiCategory(aqi) !== said)
      issues.push({
        rule: 'aqi_category',
        message: `AQI ${aqi} is ${aqiCategory(aqi)}, not ${said}.`,
      })
  }
  return issues
}

/** A forecast range ("AQI 151 to 200") must end in the category the advisory states. */
export function lintAqiRange(range: string, category: string): AirLintIssue[] {
  const numbers = [...range.matchAll(/\d{1,3}/g)].map((m) => Number(m[0]))
  if (!numbers.length) return []
  const top = Math.max(...numbers)
  return aqiCategory(top) === category
    ? []
    : [
        {
          rule: 'aqi_category',
          message: `The highest AQI in "${range}" is ${aqiCategory(top)}, not ${category}.`,
        },
      ]
}
