// @vitest-environment happy-dom
// Plan seams in the generate screen (#427): the brief's picker (at most three, empty states,
// run the plan check), the brief draft, the "From plan seams" ideas toggle and the idea
// card's "Tests" line.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { PlanConflictsFile, PlanFinding } from '@shared/schemas/plan-conflicts'
import type { ScenarioIdea } from '@shared/schemas/scenario'
import { queryClient } from '../../lib/query'
import { PROJECT, mockTtx, type Handlers } from '../documents/test-utils'
import { draftFromIdea, emptyDraft, toBrief } from './brief-form'
import { IdeaCard } from './IdeaCard'
import { IdeasPanel } from './IdeasPanel'
import { SeamPicker } from './SeamPicker'

const hex = (n: number) => n.toString(16).padStart(16, '0')

function finding(n: number, over: Partial<PlanFinding> = {}): PlanFinding {
  return {
    id: hex(n),
    kind: 'contradiction',
    slot: `slot_${n}`,
    slotLabel: `Seam number ${n}`,
    subject: 'releases',
    a: {
      documentId: 'erp',
      documentTitle: 'Emergency Response Plan',
      headingPath: 'ERP › 4.2 Releases',
      page: 3,
      chunkId: n * 10,
      span: `The Incident Commander approves releases (${n}).`,
    },
    b: {
      documentId: 'cca',
      documentTitle: 'Crisis Communications Annex',
      headingPath: 'CCA › C.1 Approval',
      chunkId: n * 10 + 1,
      span: 'All public releases must be approved by the Public Information Officer.',
    },
    values: ['Incident Commander', 'Public Information Officer'],
    verdict: 'contradicts',
    status: 'open',
    foundAt: '2026-10-28T12:00:00.000Z',
    ...over,
  }
}

const file = (findings: PlanFinding[]): PlanConflictsFile => ({
  formatVersion: 1,
  checkedAt: '2026-10-28T12:00:00.000Z',
  documents: [],
  findings,
})

function withQuery(ui: React.ReactNode) {
  queryClient.clear()
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

function Picker(props: { initial?: string[] }) {
  const [ids, setIds] = useState<string[]>(props.initial ?? [])
  return <SeamPicker projectPath={PROJECT} value={ids} onChange={setIds} />
}

function setupPicker(handlers: Handlers, initial?: string[]) {
  const ttx = mockTtx(handlers)
  withQuery(<Picker {...(initial ? { initial } : {})} />)
  return ttx
}

afterEach(() => cleanup())

describe('Plan seams picker', () => {
  it('offers to run the plan check when none has run', async () => {
    const ttx = setupPicker({
      'plan-check:get': () => null,
      'plan-check:run': () => ({ jobId: 'PC1' }),
    })
    expect(await screen.findByText(/No plan check yet/)).toBeTruthy()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Run plan check' }))
    await waitFor(() =>
      expect(ttx.calls('plan-check:run')[0]).toEqual({
        projectPath: PROJECT,
        confirmWithModel: false,
        withinDocument: false,
      }),
    )
  })

  it('says so when the plans have no open conflicts', async () => {
    setupPicker({
      'plan-check:get': () => file([finding(1, { status: 'dismissed' })]),
    })
    expect(await screen.findByText('No open conflicts between your plans.')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('lists seams with both documents, labels unconfirmed ones and shows the passages', async () => {
    setupPicker({
      'plan-check:get': () =>
        file([
          finding(1, { verdict: 'unconfirmed' }),
          finding(2, {
            kind: 'dangling_reference',
            slotLabel: 'Translated notices',
            missingTarget: 'Annex F',
          }),
        ]),
    })
    const group = await screen.findByRole('group', { name: 'Plan seams to test' })
    const first = await within(group).findByRole('checkbox', { name: /Seam number 1/ })
    expect(first.closest('label')!.textContent).toContain(
      'Emergency Response Plan and Crisis Communications Annex',
    )
    expect(first.closest('label')!.textContent).toContain('unconfirmed')
    const dangling = within(group).getByRole('checkbox', { name: /Translated notices/ })
    expect(dangling.closest('label')!.textContent).toContain('points to Annex F')
    expect(group.textContent).toContain('approved by the Public Information Officer')
  })

  it('allows at most three seams and says why the rest are disabled', async () => {
    setupPicker({ 'plan-check:get': () => file([1, 2, 3, 4].map((n) => finding(n))) })
    const user = userEvent.setup()
    const boxes = await screen.findAllByRole('checkbox')
    expect(screen.getByRole('status').textContent).toBe('0 of 3 selected.')
    for (const b of boxes.slice(0, 3)) await user.click(b)
    expect(boxes[3]!).toHaveProperty('disabled', true)
    expect(screen.getByRole('status').textContent).toContain('You can test at most three seams')
    await user.click(boxes[0]!)
    expect(boxes[3]!).toHaveProperty('disabled', false)
    expect(screen.getByRole('status').textContent).toBe('2 of 3 selected.')
  })
})

describe('brief draft seams', () => {
  const idea: ScenarioIdea = {
    id: 'idea1',
    title: 'Two approvers',
    hook: 'A boil notice needs approval at 2 a.m.',
    threat: '',
    systemsAffected: [],
    sectionsExercised: [],
    difficulty: 'intermediate',
    whyItTeaches: '',
    suggestedRoles: [],
    seamIds: [hex(1), hex(2), hex(3), hex(4)],
  }

  it('preselects the seams of an idea, at most three', () => {
    expect(draftFromIdea(idea).seamIds).toEqual([hex(1), hex(2), hex(3)])
  })

  it('sends seamIds only when some are picked', () => {
    const base = { ...emptyDraft(), userPrompt: 'Water main break' }
    expect(toBrief(base)).not.toHaveProperty('seamIds')
    expect(toBrief({ ...base, seamIds: [hex(1)] }).seamIds).toEqual([hex(1)])
  })
})

describe('ideas from plan seams', () => {
  it('passes fromSeams when the toggle is on', async () => {
    const ttx = mockTtx({
      'plan-check:get': () => file([finding(1)]),
      'generate:ideas-result': () => [],
      'grounding:ideas': () => ({}),
      'generate:ideas': () => ({ jobId: 'IDEAS1' }),
    })
    withQuery(<IdeasPanel projectPath={PROJECT} onDevelop={() => undefined} />)
    const user = userEvent.setup()
    const toggle = await screen.findByRole('checkbox', { name: 'From plan seams' })
    await waitFor(() => expect(toggle).toHaveProperty('disabled', false))
    await user.click(toggle)
    await user.click(screen.getByRole('button', { name: /Give me ideas/ }))
    await waitFor(() =>
      expect(ttx.calls('generate:ideas')[0]).toMatchObject({ fromSeams: true, count: 6 }),
    )
  })

  it('disables the toggle when there are no seams', async () => {
    mockTtx({
      'plan-check:get': () => null,
      'generate:ideas-result': () => [],
      'grounding:ideas': () => ({}),
    })
    withQuery(<IdeasPanel projectPath={PROJECT} onDevelop={() => undefined} />)
    const toggle = await screen.findByRole('checkbox', { name: 'From plan seams' })
    expect(toggle).toHaveProperty('disabled', true)
    expect(screen.getByText(/Run the plan check on the Documents page first/)).toBeTruthy()
  })

  it('names the seams an idea tests and skips unknown ids', () => {
    const idea: ScenarioIdea = {
      id: 'i1',
      title: 'Two approvers',
      hook: 'hook',
      threat: '',
      systemsAffected: [],
      sectionsExercised: [],
      difficulty: 'intermediate',
      whyItTeaches: '',
      suggestedRoles: [],
      seamIds: [hex(1), hex(9)],
    }
    render(
      <ul>
        <IdeaCard idea={idea} onDevelop={() => undefined} findings={[finding(1)]} />
      </ul>,
    )
    const tests = screen.getByText('Tests').nextElementSibling!
    expect(tests.textContent).toBe(
      'Seam number 1 (Emergency Response Plan vs Crisis Communications Annex)',
    )
  })
})
