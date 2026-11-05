// @vitest-environment happy-dom
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Scenario } from '@shared/schemas/scenario'
import { ToolkitSchema } from '@shared/toolkits'
import { PROJECT, SCENARIO, mockTtx, renderWithClient } from '../test-helpers'
import { ConductDetailsEditor } from './ConductDetailsEditor'

afterEach(() => cleanup())

const toolkit = ToolkitSchema.parse({
  id: 'epidemiology',
  name: 'Epidemiology',
  description: 'x',
  exerciseTags: [
    {
      id: 'phep_biological_incident_100',
      label: 'PHEP Biological Incident 100',
      program: 'CDC PHEP 2024-2028 Exercise Framework',
      version: 'April 2024',
      source: 'https://www.cdc.gov/example.pdf',
      type: 'discussion',
      objectives: ['Medical countermeasures: discuss throughput.'],
      participants: 'Public health and emergency management.',
      improvementPlanDueDays: 90,
    },
  ],
})

function setup(withTags: boolean, scenario: Scenario = SCENARIO) {
  const ttx = mockTtx({
    'scenarios:get': () => scenario,
    'scenarios:save': (req: { scenario: Scenario }) => req.scenario,
    'scenarios:history': () => [],
    'toolkits:list': () => ({
      toolkits: withTags
        ? [
            {
              toolkit,
              source: { layer: 'bundled', packId: 'p', packName: 'P', packVersion: '1' },
              enabled: false,
            },
          ]
        : [],
      projectDefault: [],
    }),
  })
  renderWithClient(<ConductDetailsEditor projectPath={PROJECT} scenario={scenario} />)
  return { ttx, user: userEvent.setup() }
}

describe('program exercise tags in the exercise details (#842)', () => {
  it('offers a tag, shows its suggestions when ticked, and saves its id in the conduct details', async () => {
    const { ttx, user } = setup(true)
    const box = await screen.findByRole('checkbox', { name: 'PHEP Biological Incident 100' })
    expect(screen.queryByText('Suggested objectives')).toBeNull()
    await user.click(box)
    expect(screen.getByText('Suggested objectives')).toBeTruthy()
    expect(screen.getByText(/Medical countermeasures: discuss throughput/)).toBeTruthy()
    expect(screen.getByText(/Improvement plan data is due 90 days after the exercise/)).toBeTruthy()
    expect(screen.getByText(/this app submits nothing/i)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(ttx.calls('scenarios:save').length).toBeGreaterThan(0))
    const saved = (ttx.calls('scenarios:save').at(-1) as { scenario: Scenario }).scenario
    expect(saved.conduct?.exerciseTags).toEqual(['phep_biological_incident_100'])
  })

  it('adds the suggested objectives to the scenario once, saved against the latest scenario', async () => {
    const { ttx, user } = setup(true)
    await user.click(await screen.findByRole('checkbox', { name: 'PHEP Biological Incident 100' }))
    await user.click(screen.getByRole('button', { name: 'Add to scenario objectives' }))
    expect(await screen.findByText('Added 1 objective to the scenario.')).toBeTruthy()
    const saved = ttx.calls('scenarios:save').at(-1) as { scenario: Scenario; note: string }
    expect(saved.note).toBe('Added objectives from PHEP Biological Incident 100')
    const added = saved.scenario.objectives.at(-1)!
    expect(added).toMatchObject({ name: 'Medical countermeasures', text: 'Discuss throughput.' })
    expect(saved.scenario.objectives.slice(0, -1)).toEqual(SCENARIO.objectives)
  })

  it('says so when the scenario already has the objectives', async () => {
    const withObjective: Scenario = {
      ...SCENARIO,
      objectives: [
        ...SCENARIO.objectives,
        { id: 'obj-x', name: 'Medical countermeasures', text: 'Discuss throughput.' },
      ],
    }
    const { ttx, user } = setup(true, withObjective)
    await user.click(await screen.findByRole('checkbox', { name: 'PHEP Biological Incident 100' }))
    await user.click(screen.getByRole('button', { name: 'Add to scenario objectives' }))
    expect(await screen.findByText('The scenario already has these objectives.')).toBeTruthy()
    expect(ttx.calls('scenarios:save')).toHaveLength(0)
  })

  it('shows nothing when no toolkit offers a tag', async () => {
    setup(false)
    await screen.findByRole('textbox', { name: 'Sponsor organization' })
    expect(screen.queryByText('Program exercise')).toBeNull()
  })
})
