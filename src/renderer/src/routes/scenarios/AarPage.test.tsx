// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { Aar, ExerciseRecord } from '@shared/schemas/aar'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { mockTtx, projectUrl, renderAt } from '../documents/test-utils'
import AarPage from './AarPage'
import { AAR_SAVE_DELAY_MS } from './use-aar-draft'

const scenario = Scenario.parse(fixture)
const NOW = '2026-10-28T14:00:00.000Z'

const aar = (): Aar => ({
  formatVersion: 1,
  createdAt: NOW,
  updatedAt: NOW,
  executiveSummaryMd: 'Summary.',
  sourcesUsed: ['facilitator'],
  capabilities: [
    {
      capability: 'operational_coordination',
      proposedRating: 'S',
      ratingRationale: 'Command was established; the Go Dark call was split.',
      observationCounts: { met: 1, partial: 1, not_met: 0, not_observed: 0 },
      objectiveRefs: ['obj-decision'],
      strengths: [
        {
          id: 'F-1',
          title: 'Incident command established early',
          analysisMd: 'Ops took command at the first confirmed error.',
          citations: [],
          evidence: ['note:I-06'],
          objectiveRefs: [],
          recommendation: '',
          correctiveActions: [],
          locked: false,
        },
      ],
      areasForImprovement: [
        {
          id: 'F-2',
          title: 'Go Dark call decided apart',
          analysisMd: 'IT and Ops decided apart.',
          citations: [],
          evidence: ['note:I-09', 'dec:dec-1'],
          objectiveRefs: [],
          recommendation: 'Make it a joint call.',
          correctiveActions: [
            {
              id: 'CA-1',
              action: 'Revise TIRP 13.6 so the Go Dark decision is joint',
              element: 'planning',
              ownerRole: 'ops-director',
              ownerOrganization: '',
              poc: '',
              status: 'open',
              locked: false,
            },
          ],
          locked: false,
        },
      ],
    },
  ],
  participantFeedbackMd: '',
  participatingOrganizations: [],
  acronyms: [],
  provenance: [],
})

const record: ExerciseRecord = {
  sources: { facilitator: true, evaluation: false, live: false, surveys: false },
  delivered: [],
  notes: [
    { ref: 'note:I-06', rowId: 'I-06', text: 'Ops kept the FIDS on for 12 minutes.' },
    { ref: 'note:I-09', rowId: 'I-09', text: 'Go Dark decided in the IT room.' },
  ],
  hotwash: [],
  decisions: [
    { ref: 'dec:dec-1', exerciseTime: '2:05', rowId: 'I-09', text: 'Go dark now.', byRole: 'IT' },
  ],
  observations: [],
  votes: [],
  messages: [],
  messageCounts: [],
  surveys: [],
  warnings: [],
}

function setup(initial: Aar | null) {
  let stored = initial
  const ttx = mockTtx({
    'scenarios:get': () => scenario,
    'facilitator:state-get': () => ({
      elapsedMin: 0,
      delivered: {},
      notes: { 'I-06': 'Ops kept the FIDS on for 12 minutes.' },
      generalNotes: '',
      hotwash: [],
      decisions: [],
    }),
    'aar:get': () => stored,
    'aar:save': (req: { aar: Aar }) => {
      stored = { ...req.aar, updatedAt: '2026-10-28T15:00:00.000Z' }
      return stored
    },
    'aar:record': () => record,
    'aar:sessions': () => [],
    'scenarios:doc-get': () => ({ markdown: '# After-Action Report\n\nBody.' }),
    'scenarios:history': () => [],
  })
  renderAt(
    projectUrl(`scenarios/${scenario.id}/aar`),
    '/p/:projectKey/scenarios/:scenarioId/aar',
    AarPage,
  )
  return { ...ttx, stored: () => stored }
}

const lastSave = (calls: unknown[]) => (calls.at(-1) as { aar: Aar; baseUpdatedAt?: string }).aar

afterEach(() => cleanup())

describe('AarPage (#419)', () => {
  it('offers the first draft when no AAR exists', async () => {
    setup(null)
    expect(await screen.findByText('No After-Action Report yet')).toBeTruthy()
    const button = screen.getByRole('button', { name: /Draft AAR\/IP/ }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('confirms a rating and saves it with the base updatedAt', async () => {
    const ttx = setup(aar())
    const user = userEvent.setup()
    expect(await screen.findByText('Ratings pending: 1 of 1')).toBeTruthy()
    const group = screen.getByRole('group', {
      name: 'Confirmed rating for Operational Coordination',
    })
    expect(
      (within(group).getByRole('radio', { name: 'Not confirmed' }) as HTMLInputElement).checked,
    ).toBe(true)
    await user.click(within(group).getByRole('radio', { name: /^S / }))
    await waitFor(() => expect(ttx.calls('aar:save')).toHaveLength(1), {
      timeout: AAR_SAVE_DELAY_MS + 2000,
    })
    const req = ttx.calls('aar:save')[0] as { aar: Aar; baseUpdatedAt?: string }
    expect(req.baseUpdatedAt).toBe(NOW)
    expect(req.aar.capabilities[0]!.rating).toBe('S')
    expect(await screen.findByText('All ratings confirmed')).toBeTruthy()
  })

  it('edits the Improvement Plan row: owner organization, due date and lock', async () => {
    const ttx = setup(aar())
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: 'Improvement Plan' })
    await user.type(
      screen.getByLabelText('Primary responsible organization, row 1'),
      'Airport Operations',
    )
    await user.click(screen.getByLabelText('Keep on re-draft, row 1'))
    await waitFor(() => expect(ttx.calls('aar:save').length).toBeGreaterThan(0), {
      timeout: AAR_SAVE_DELAY_MS + 2000,
    })
    await waitFor(() => {
      const saved = lastSave(ttx.calls('aar:save'))
      const action = saved.capabilities[0]!.areasForImprovement[0]!.correctiveActions[0]!
      expect(action.ownerOrganization).toBe('Airport Operations')
      expect(action.locked).toBe(true)
    })
  })

  it('resolves a finding’s evidence refs against the exercise record', async () => {
    setup(aar())
    const user = userEvent.setup()
    await user.click(
      await screen.findByRole('button', { name: 'Evidence for Go Dark call decided apart' }),
    )
    const drawer = await screen.findByRole('complementary', { name: 'Evidence' })
    expect(await within(drawer).findByText('Go Dark decided in the IT room.')).toBeTruthy()
    expect(within(drawer).getByText('Go dark now.')).toBeTruthy()
    expect(within(drawer).getByText(/2:05 · I-09 · IT/)).toBeTruthy()
  })
})
