// @vitest-environment happy-dom
// Evaluation › field metrics controls (spec 0448 FR-12): nothing changes without toolkit metrics;
// with them, a button computes the results and an editor takes the key facts message
// consistency needs.
import { QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { MetricResult } from '@shared/schemas/metrics'
import { queryClient } from '../../lib/query'
import { mockTtx, PROJECT } from '../documents/test-utils'
import { FieldMetricsPanel } from './FieldMetricsPanel'

afterEach(() => {
  cleanup()
  queryClient.clear()
})

const result: MetricResult = {
  metricId: 'decision_timing',
  title: 'Bulletin lead time',
  computedAt: '2026-10-28T18:00:00.000Z',
  config: {},
  inputs: [],
  summary: [{ label: 'Hits', value: '1' }],
  tables: [],
  caveats: [],
  data: {},
}

const record = { formatVersion: 1, observations: [], updatedAt: '2026-10-28T18:00:00.000Z' }

function show(props: Partial<Parameters<typeof FieldMetricsPanel>[0]> = {}) {
  render(
    <QueryClientProvider client={queryClient}>
      <FieldMetricsPanel
        projectPath={PROJECT}
        scenarioId="s1"
        results={[]}
        keyFacts={[]}
        statements={[]}
        {...props}
      />
    </QueryClientProvider>,
  )
}

const planOf = (ids: string[], sessionId?: string) => ({
  metrics: ids.map((id) => ({
    id,
    title: id,
    toolkitId: 'wired_field',
    toolkitName: 'Wired field',
    needsKeyFacts: id === 'message_consistency',
  })),
  ...(sessionId ? { sessionId } : {}),
})

describe('FieldMetricsPanel', () => {
  it('shows only the stored results when no toolkit configures a metric', async () => {
    mockTtx({ 'evaluation:metrics-plan': () => planOf([]) })
    show({ results: [result] })
    expect(await screen.findByRole('heading', { name: 'Field metrics' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /field metrics/i })).toBeNull()
  })

  it('computes the metrics for the newest session and reports one that could not run', async () => {
    const t = mockTtx({
      'evaluation:metrics-plan': () => planOf(['decision_timing'], 'sess-1'),
      'evaluation:metrics-run': () => ({
        results: [result],
        skipped: [{ id: 'threshold_timing', reason: 'The app has no metric with this id.' }],
        record: { ...record, metricResults: [result] },
      }),
    })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Compute field metrics' }))
    await waitFor(() =>
      expect(
        screen.getByText(/threshold_timing was not computed: The app has no metric/),
      ).toBeTruthy(),
    )
    expect(t.calls('evaluation:metrics-run')).toEqual([
      { projectPath: PROJECT, scenarioId: 's1', sessionId: 'sess-1' },
    ])
  })

  it('takes key facts and statements for message consistency and saves them', async () => {
    const t = mockTtx({
      'evaluation:metrics-plan': () => planOf(['message_consistency']),
      'evaluation:metric-inputs': () => record,
    })
    show()
    await userEvent.click(await screen.findByRole('button', { name: 'Add a key fact' }))
    await userEvent.type(screen.getByLabelText('Key fact 1'), 'Landfall time')
    await userEvent.click(screen.getByRole('button', { name: 'Add a statement' }))
    await userEvent.type(screen.getByLabelText('Partner for statement 1'), 'County')
    await userEvent.type(screen.getByLabelText('Stated value for statement 1'), '14:00')
    await userEvent.click(screen.getByRole('button', { name: 'Save key facts' }))
    await waitFor(() => expect(t.calls('evaluation:metric-inputs')).toHaveLength(1))
    expect(t.calls('evaluation:metric-inputs')[0]).toEqual({
      projectPath: PROJECT,
      scenarioId: 's1',
      keyFacts: [{ id: 'fact_1', label: 'Landfall time' }],
      factStatements: [{ factId: 'fact_1', partner: 'County', value: '14:00' }],
    })
  })
})
