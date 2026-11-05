// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MetricResult } from '@shared/schemas/metrics'
import { FieldMetrics } from './FieldMetrics'

const result: MetricResult = {
  metricId: 'decision_timing',
  title: 'Decision timing',
  computedAt: '2026-10-28T18:00:00.000Z',
  config: {},
  inputs: [{ label: 'Ground-truth events scored', value: '3' }],
  summary: [{ label: 'POD (probability of detection)', value: '0.667' }],
  tables: [{ title: 'Events', columns: ['Event', 'Outcome'], rows: [['e1', 'Hit']] }],
  caveats: ['Lead time is measured on hits only.'],
  data: {},
}

afterEach(cleanup)

describe('FieldMetrics', () => {
  it('shows inputs, numbers, tables and caveats', () => {
    render(<FieldMetrics results={[result]} />)
    expect(screen.getByRole('heading', { name: 'Field metrics' })).toBeTruthy()
    expect(screen.getByText('Ground-truth events scored: 3')).toBeTruthy()
    expect(screen.getByRole('row', { name: /POD.*0\.667/ })).toBeTruthy()
    expect(screen.getByRole('cell', { name: 'Hit' })).toBeTruthy()
    expect(screen.getByText('Lead time is measured on hits only.')).toBeTruthy()
  })

  it('renders nothing without results', () => {
    const { container } = render(<FieldMetrics results={[]} />)
    expect(container.textContent).toBe('')
  })
})
