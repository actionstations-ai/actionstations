// @vitest-environment happy-dom
// "Make drills from this scenario" (#437 FR-7): needs a chosen scenario, passes the build
// settings through, and has no axe violations.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { MicroDrillSettings } from '@shared/schemas'
import { PROJECT, mockTtx, renderAt } from '../documents/test-utils'
import { FromScenario } from './FromScenario'

afterEach(cleanup)

const settings = MicroDrillSettings.parse({ stepCount: 3, focus: 'deadlines' })

function setup() {
  const ttx = mockTtx({
    'scenarios:list': () => [
      { id: 's1', title: 'Baggage outage', status: 'draft', updatedAt: '2026-10-01T00:00:00.000Z' },
    ],
    'microdrills:from-scenario': () => ({ jobId: 'J1' }),
  })
  renderAt('/x', '/x', () => <FromScenario projectPath={PROJECT} settings={settings} />)
  return ttx
}

describe('FromScenario', () => {
  it('stays disabled until a scenario is chosen, then starts the job with the settings', async () => {
    const ttx = setup()
    const button = await screen.findByRole('button', { name: 'Make drills from this scenario' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(await screen.findByLabelText('Scenario'), { target: { value: 's1' } })
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(button)
    await waitFor(() => expect(ttx.calls('microdrills:from-scenario')).toHaveLength(1))
    expect(ttx.calls('microdrills:from-scenario')[0]).toEqual({
      projectPath: PROJECT,
      scenarioId: 's1',
      settings,
    })
  })

  it('has no axe violations', async () => {
    setup()
    await screen.findByRole('option', { name: 'Baggage outage' })
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
