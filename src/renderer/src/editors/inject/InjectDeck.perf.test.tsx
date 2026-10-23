// @vitest-environment happy-dom
// #201: on a 300-card deck, job progress re-renders only the cards whose state changed, and
// long decks mount only the cards near the viewport. Card renders are counted through
// useHasDraft, which every card calls once per render.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { queryClient } from '../../lib/query'
import { PROJECT, mockTtx } from '../../routes/documents/test-utils'
import { largeScenario, stubListLayout } from '../msel/large-fixture'
import { deckEntries, reuseEntries } from './deck-model'
import type * as Draft from './draft'
import { InjectDeck } from './InjectDeck'

const renders = vi.hoisted(() => ({ n: 0 }))

vi.mock('./draft', async (importOriginal) => {
  const mod = await importOriginal<typeof Draft>()
  return {
    ...mod,
    useHasDraft: (...args: Parameters<typeof Draft.useHasDraft>) => {
      renders.n++
      return mod.useHasDraft(...args)
    },
  }
})
const ROWS = 300
const scenario = { ...largeScenario(Scenario.parse(fixture), ROWS), id: 'scen1' }

async function setup() {
  const ttx = mockTtx({
    'injects:list': () => [],
    'templates:list': () => [],
    'jobs:list': () => [],
    'generate:injects': () => ({ jobId: 'J9' }),
  })
  queryClient.clear()
  const t0 = performance.now()
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <div className="main" style={{ overflow: 'auto' }}>
          <InjectDeck projectPath={PROJECT} scenario={scenario} />
        </div>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  const mountMs = performance.now() - t0
  const deck = await screen.findByRole('grid', { name: 'Inject deck' })
  return { ttx, deck, mountMs }
}

/** Emit progress for `itemId`; returns the ms the re-render took. */
function progress(ttx: Awaited<ReturnType<typeof setup>>['ttx'], itemId: string): number {
  renders.n = 0
  const t0 = performance.now()
  act(() =>
    ttx.emit('job:progress', {
      jobId: 'J9',
      kind: 'generate-injects',
      status: 'running',
      progress: 0.1,
      message: `inject ${itemId}`,
      itemId,
    }),
  )
  return performance.now() - t0
}

let restoreLayout = () => {}
beforeAll(() => {
  restoreLayout = stubListLayout('.main', 800, 200)
})
afterAll(() => restoreLayout())
afterEach(() => cleanup())

describe('inject deck render cost (#201)', () => {
  it('keeps the entry objects a refetch brings back unchanged', () => {
    const before = deckEntries(scenario, [])
    const refetched = structuredClone(scenario)
    refetched.msel[3] = { ...refetched.msel[3]!, event: 'Changed' }
    const after = reuseEntries(before, deckEntries(refetched, []))
    expect(after[0]).toBe(before[0])
    expect(after[3]).not.toBe(before[3])
    expect(after[3]!.row.event).toBe('Changed')
    expect(after.filter((e, i) => e !== before[i])).toHaveLength(1)
  })

  it('re-renders only the cards whose job state changed', async () => {
    const { ttx } = await setup()
    await userEvent.click(screen.getByRole('button', { name: 'Write all injects' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Write all injects' })))
    progress(ttx, 'R-001')
    progress(ttx, 'R-002')
    // R-001 went from "Working" to "Done" and R-002 became "Working".
    expect(renders.n).toBe(2)
    const times = ['R-003', 'R-004', 'R-005', 'R-006', 'R-007'].map((id) => progress(ttx, id))
    const median = [...times].sort((a, b) => a - b)[2]!
    if (process.env.BENCH)
      process.stdout.write(
        `\n[bench] ${ROWS}-card deck progress update: median ${median.toFixed(1)} ms, ` +
          `cards rendered: ${renders.n}\n`,
      )
  })

  it('mounts only the cards near the viewport, keeping grid semantics', async () => {
    const { deck, mountMs } = await setup()
    if (process.env.BENCH)
      process.stdout.write(`\n[bench] ${ROWS}-card deck mount ${mountMs.toFixed(0)} ms\n`)
    const rows = within(deck).getAllByRole('row')
    expect(rows.length).toBeLessThan(40)
    expect(deck.getAttribute('aria-rowcount')).toBe(String(ROWS))
    expect(
      within(deck)
        .getAllByRole('gridcell')
        .filter((c) => c.tabIndex === 0),
    ).toHaveLength(1)
  })

  it('End moves focus to the last card, mounting it', async () => {
    const { deck } = await setup()
    const first = within(deck).getAllByRole('gridcell')[0]!
    first.focus()
    act(() => {
      fireEvent.keyDown(first, { key: 'End' })
    })
    const last = document.activeElement!.closest('[role="row"]')!
    expect(last.getAttribute('aria-rowindex')).toBe(String(ROWS))
    expect(within(last as HTMLElement).getByText('R-300')).toBeTruthy()
  })
})
