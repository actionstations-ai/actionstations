// @vitest-environment happy-dom
// The facilitator view shows the case clock beside the exercise clock (spec 0448 FR-9), with the
// historical or simulated label.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CaseManifest } from '@shared/schemas/case-data'
import { CaseClockView } from './CaseClock'
import { originWords } from './case-origin'

const provenance = {
  historical: {
    origin: 'historical',
    source: 'NOAA',
    retrieved: '2026-03-02T10:00:00Z',
    terms: '',
    citation: '',
  },
  simulated: {
    origin: 'simulated',
    source: 'Storm track',
    generator: 'storm-track',
    terms: '',
    citation: '',
  },
} as const

const manifest = (origins: ('historical' | 'simulated')[], withMap = true) =>
  CaseManifest.parse({
    datasets: origins.map((o, i) => ({
      id: `d${i}`,
      kind: 'text',
      label: `Data ${i}`,
      file: `d${i}.json`,
      provenance: provenance[o],
    })),
    ...(withMap
      ? {
          timeMapping: {
            caseStart: '2024-09-26T12:00:00Z',
            speed: 2,
            jumps: [{ atMin: 60, skipMin: 120 }],
          },
        }
      : {}),
  })

afterEach(cleanup)

describe('case clock', () => {
  it('shows the case time for the exercise minute, with the jump applied', () => {
    render(<CaseClockView manifest={manifest(['historical'])} minutes={75} />)
    // 75 * 2 + 120 = 270 minutes after 12:00
    expect(screen.getByRole('timer', { name: 'Case time' }).textContent).toBe(
      '2024-09-26 16:30 UTC',
    )
    expect(screen.getByLabelText('Case clock').textContent).toContain('Historical data')
    expect(screen.getByLabelText('Case clock').textContent).toContain('2× case time')
  })

  it('says simulated for simulated data and both when mixed', () => {
    expect(originWords(manifest(['simulated']))).toBe('Simulated data')
    expect(originWords(manifest(['historical', 'simulated']))).toBe('Historical and simulated data')
  })

  it('shows nothing without a time mapping or without datasets', () => {
    const a = render(<CaseClockView manifest={manifest(['historical'], false)} minutes={5} />)
    expect(a.container.textContent).toBe('')
    const b = render(<CaseClockView manifest={manifest([])} minutes={5} />)
    expect(b.container.textContent).toBe('')
  })
})
