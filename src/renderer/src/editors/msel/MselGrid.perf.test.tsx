// @vitest-environment happy-dom
// #201: a committed edit re-renders only the changed row, on a 300-row MSEL.
// Row renders are counted through useSortable, which every MSEL / phase row calls once per render.
import type * as Sortable from '@dnd-kit/sortable'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { PROJECT, mockTtx } from '../../routes/documents/test-utils'
import { queryClient } from '../../lib/query'
import { largeScenario, stubListLayout } from './large-fixture'
import { MselEditor, type RowJump } from './MselEditor'

const renders = vi.hoisted(() => new Map<string, number>())

vi.mock('@dnd-kit/sortable', async (importOriginal) => {
  const mod = await importOriginal<typeof Sortable>()
  return {
    ...mod,
    useSortable: (args: Parameters<typeof Sortable.useSortable>[0]) => {
      const id = String(args.id)
      renders.set(id, (renders.get(id) ?? 0) + 1)
      return mod.useSortable(args)
    },
  }
})

const ROWS = 300
const scenario = largeScenario(Scenario.parse(fixture), ROWS)

function setup(jump?: RowJump) {
  mockTtx({
    'scenarios:lint': () => [],
    'scenarios:save': (req: { scenario: Scenario }) => req.scenario,
  })
  queryClient.clear()
  const ui = (j?: RowJump) => (
    <QueryClientProvider client={queryClient}>
      <MselEditor projectPath={PROJECT} scenario={scenario} {...(j ? { jump: j } : {})} />
    </QueryClientProvider>
  )
  const t0 = performance.now()
  const { rerender } = render(ui(jump))
  return { mountMs: performance.now() - t0, jumpTo: (j: RowJump) => rerender(ui(j)) }
}

const grid = () => screen.getByRole('grid', { name: 'Master Scenario Events List' })
const rowWith = (id: string) =>
  within(grid())
    .getAllByRole('row')
    .find((r) => r.querySelector('.msel-editor__id')?.textContent === id)!
const keyOf = (id: string) => rowWith(id).getAttribute('data-row-key')!
const totalRenders = () => [...renders.values()].reduce((a, b) => a + b, 0)

/** Open the event editor of `id`, type `text` and commit with Enter; returns the commit ms. */
function editEvent(id: string, text: string): number {
  const cell = rowWith(id).querySelector<HTMLElement>('[data-col="event"]')!
  fireEvent.doubleClick(cell)
  const box = screen.getByRole('textbox', { name: `Event for ${id}` })
  fireEvent.change(box, { target: { value: text } })
  renders.clear()
  const t0 = performance.now()
  act(() => {
    fireEvent.keyDown(box, { key: 'Enter' })
  })
  return performance.now() - t0
}

let restoreLayout = () => {}
beforeAll(() => {
  restoreLayout = stubListLayout('.msel-editor__scroll')
})
afterAll(() => restoreLayout())

afterEach(() => {
  cleanup()
  renders.clear()
})

describe('MSEL grid render cost (#201)', () => {
  it('re-renders only the edited row when an edit is committed', () => {
    setup()
    const key = keyOf('R-002')
    editEvent('R-002', 'Changed once')
    expect(within(rowWith('R-002')).getByText('Changed once')).toBeTruthy()
    expect(renders.get(key)).toBeGreaterThan(0)
    // The edited row (its new content, then focus back on the cell) and nothing else.
    expect(totalRenders()).toBe(renders.get(key))
    expect(renders.get(keyOf('R-001'))).toBeUndefined()
    expect(renders.get(keyOf('R-003'))).toBeUndefined()
  })

  it('reports the time to commit an edit (BENCH=1 prints it)', () => {
    const { mountMs } = setup()
    const times = Array.from({ length: 10 }, (_, i) => editEvent('R-003', `Edit ${i}`))
    const median = [...times].sort((a, b) => a - b)[5]!
    if (process.env.BENCH)
      process.stdout.write(
        `\n[bench] ${ROWS}-row MSEL mount ${mountMs.toFixed(0)} ms; commit: median ${median.toFixed(1)} ms, ` +
          `rows rendered on last commit: ${totalRenders()}\n`,
      )
    expect(median).toBeGreaterThan(0)
  })

  it('mounts only the rows near the viewport and keeps grid semantics', () => {
    setup()
    const rows = within(grid()).getAllByRole('row')
    expect(rows.length).toBeLessThan(60)
    // Header + 4 phase lines + 300 rows, each mounted row knowing its position.
    expect(grid().getAttribute('aria-rowcount')).toBe(String(1 + 4 + ROWS))
    expect(rowWith('R-001').getAttribute('aria-rowindex')).toBe('3')
    // Still exactly one tab stop.
    expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  })

  it('moves focus with Ctrl+End to the last row, mounting it', () => {
    setup()
    const first = rowWith('R-001').querySelector<HTMLElement>('[data-col="time"]')!
    first.focus()
    act(() => {
      fireEvent.keyDown(first, { key: 'End', ctrlKey: true })
    })
    const last = rowWith('R-300')
    expect(last).toBeTruthy()
    expect(last.contains(document.activeElement)).toBe(true)
    expect(last.getAttribute('aria-rowindex')).toBe(String(1 + 4 + ROWS))
  })

  it('focuses a far row asked for by "Go to row"', () => {
    const { jumpTo } = setup()
    expect(rowWith('R-250')).toBeUndefined()
    act(() => jumpTo({ rowId: 'R-250', n: 1 }))
    const cell = rowWith('R-250').querySelector('[data-col="id"]')!
    expect(cell.contains(document.activeElement)).toBe(true)
  })
})
