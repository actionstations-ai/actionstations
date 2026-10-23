// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TemplateInfo } from '@shared/ipc'
import { Inject } from '@shared/schemas/inject'
import { Scenario } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import tweetSchema from '../../../../../templates/injects/tweet/schema.json'
import { queryClient } from '../../lib/query'
import { PROJECT, mockTtx } from '../../routes/documents/test-utils'
import { deckEntries, filterDeck, NO_FILTERS, workState } from './deck-model'
import { draftKey, draftOf, useDrafts } from './draft'
import { InjectDeck } from './InjectDeck'
import { PendingSavesNote } from '../docs/PendingSavesNote'
import { unsavedItems } from '../unsaved-work'

const base = Scenario.parse(fixture)
const tweet = Inject.parse({
  id: 'inj4',
  mselRowId: 'I-04',
  type: 'tweet',
  title: 'Angry traveller',
  fields: { displayName: 'Travel Guy', handle: 'TravelGuy99', text: 'Boards are wrong' },
  locked: true,
  assets: [
    {
      id: 'a1',
      kind: 'image',
      role: 'rendered',
      path: 'scenarios/scen1/media/inj4/a1.png',
      provenance: { provider: 'template', createdAt: '2026-10-21T10:00:00.000Z' },
    },
    {
      id: 'a2',
      kind: 'audio',
      role: 'generated',
      path: 'scenarios/scen1/media/inj4/a2.wav',
      provenance: { provider: 'mock', createdAt: '2026-10-21T10:00:00.000Z' },
    },
  ],
})
const scenario: Scenario = {
  ...base,
  id: 'scen1',
  msel: base.msel.map((r) => (r.id === 'I-04' ? { ...r, injectId: 'inj4' } : r)),
  warnings: [
    {
      code: 'INJECT_FIELDS_INVALID',
      severity: 'warning',
      message: 'stale',
      injectId: 'inj4',
      source: 'lint',
    },
    {
      code: 'INJECT_MEDIA_FAILED',
      severity: 'warning',
      message: 'ComfyUI down',
      injectId: 'inj4',
      source: 'lint',
    },
  ],
}
const TEMPLATES: TemplateInfo[] = [
  {
    type: 'tweet',
    label: 'Social post (X-style)',
    version: '1',
    schema: tweetSchema as Record<string, unknown>,
    preview: {},
    paper: false,
    variants: ['default'],
    width: 600,
  },
]

afterEach(() => cleanup())

describe('deck model', () => {
  const entries = deckEntries(scenario, [tweet])

  it('one entry per MSEL row in time order, with thumbnail, media flags and warnings', () => {
    expect(entries.map((e) => e.row.id).slice(0, 3)).toEqual(['START', 'I-01', 'I-02a'])
    const e = entries.find((x) => x.row.id === 'I-04')!
    expect(e.thumbnail?.id).toBe('a1')
    expect(e.audio).toBe(true)
    expect(e.video).toBe(false)
    // Shown as stored: main drops INJECT_FIELDS_INVALID when a save fixes the fields.
    expect(e.warnings.map((w) => w.code)).toEqual(['INJECT_FIELDS_INVALID', 'INJECT_MEDIA_FAILED'])
  })

  it('filters by phase, type, tag and media', () => {
    expect(filterDeck(entries, { ...NO_FILTERS, media: 'with' }).map((e) => e.row.id)).toEqual([
      'I-04',
    ])
    expect(filterDeck(entries, { ...NO_FILTERS, tag: 'RED_HERRING' }).map((e) => e.row.id)).toEqual(
      ['I-05b'],
    )
    expect(filterDeck(entries, { ...NO_FILTERS, type: 'fids_board' }).map((e) => e.row.id)).toEqual(
      ['I-06', 'I-15'],
    )
    const p1 = scenario.phases[0]!.id
    expect(
      filterDeck(entries, { ...NO_FILTERS, phase: p1 }).every((e) => e.row.phaseId === p1),
    ).toBe(true)
  })

  it('marks the item a running job is on, and the ones it passed', () => {
    const e = entries.find((x) => x.row.id === 'I-04')!
    expect(workState(e, ['I-01', 'inj4'])).toBe('working')
    expect(workState(e, ['inj4', 'I-05'])).toBe('done')
    expect(workState(e, [])).toBeUndefined()
  })
})

describe('InjectDeck', () => {
  it('renders cards and starts "Write all injects" with progress and cancel', async () => {
    const ttx = mockTtx({
      'injects:list': () => [tweet],
      'templates:list': () => TEMPLATES,
      'jobs:list': () => [],
      'generate:injects': () => ({ jobId: 'J9' }),
      'jobs:cancel': () => undefined,
    })
    const onJob = vi.fn()
    queryClient.clear()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InjectDeck projectPath={PROJECT} scenario={scenario} onJob={onJob} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const deck = await screen.findByRole('grid', { name: 'Inject deck' })
    await waitFor(() =>
      expect(within(deck).getByRole('link', { name: 'Angry traveller' })).toBeTruthy(),
    )
    const card = within(deck)
      .getByRole('link', { name: 'Angry traveller' })
      .closest('[role="row"]') as HTMLElement
    expect(
      within(card).getByRole('img', { name: /^Angry traveller — .*, MSEL row I-04$/ }),
    ).toBeTruthy()
    expect(within(card).getByText('Audio')).toBeTruthy()
    expect(within(card).getByLabelText('Locked')).toBeTruthy()
    expect(within(card).getByText(/2 warnings/)).toBeTruthy()
    expect(screen.getByText('1 of 24 rows have an inject · 1 rendered')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Write all injects' }))
    await waitFor(() => expect(onJob).toHaveBeenCalledWith('J9'))
    ttx.emit('job:progress', {
      jobId: 'J9',
      kind: 'generate-injects',
      status: 'running',
      progress: 0.2,
      message: 'inject I-04 (5/24)',
      itemId: 'inj4',
    })
    const banner = await screen.findByRole('region', { name: 'Generation status' })
    expect(within(banner).getByText(/inject I-04/)).toBeTruthy()
    expect(within(card).getByText('Working…')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Write all injects' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await userEvent.click(within(banner).getByRole('button', { name: 'Cancel job' }))
    expect(ttx.calls('jobs:cancel')).toEqual([{ jobId: 'J9' }])

    await userEvent.selectOptions(screen.getByLabelText('Media'), 'with')
    expect(
      within(screen.getByRole('grid', { name: 'Inject deck' })).getAllByRole('row'),
    ).toHaveLength(1)
  })

  it('is one tab stop; arrows and Home/End move between cards; Enter opens the editor', async () => {
    mockTtx({
      'injects:list': () => [tweet],
      'templates:list': () => TEMPLATES,
      'jobs:list': () => [],
    })
    queryClient.clear()
    const opened: string[] = []
    function Where() {
      opened.push(useLocation().pathname)
      return null
    }
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InjectDeck projectPath={PROJECT} scenario={scenario} />
          <Where />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const deck = await screen.findByRole('grid', { name: 'Inject deck' })
    await waitFor(() =>
      expect(within(deck).getByRole('link', { name: 'Angry traveller' })).toBeTruthy(),
    )
    const cells = within(deck).getAllByRole('gridcell')
    expect(cells).toHaveLength(scenario.msel.length)
    expect(cells.filter((c) => c.tabIndex === 0)).toEqual([cells[0]])
    cells[0]!.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(cells[1])
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(cells.at(-1))
    await userEvent.keyboard('{Home}{ArrowLeft}')
    expect(document.activeElement).toBe(cells[0])
    expect(cells[0]!.tabIndex).toBe(0)
    // I-04 is the 6th row in time order (START, I-01, I-02a, I-02b, I-03, I-04).
    const i04 = cells.findIndex((c) => within(c).queryByText('I-04'))
    for (let i = 0; i < i04; i++) await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(cells[i04])
    await userEvent.keyboard('{Enter}')
    expect(opened.at(-1)).toMatch(/\/scenarios\/scen1\/injects\/inj4$/)
  })

  it('Enter on a row without an inject opens "Create inject"', async () => {
    mockTtx({ 'injects:list': () => [], 'templates:list': () => TEMPLATES, 'jobs:list': () => [] })
    queryClient.clear()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <InjectDeck
            projectPath={PROJECT}
            scenario={{ ...scenario, msel: scenario.msel.map(({ injectId: _i, ...r }) => r) }}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const deck = await screen.findByRole('grid', { name: 'Inject deck' })
    within(deck).getAllByRole('gridcell')[0]!.focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('marks a card with an unsaved draft and notes it at scenario level (#202)', async () => {
    mockTtx({
      'injects:list': () => [tweet],
      'templates:list': () => TEMPLATES,
      'jobs:list': () => [],
    })
    queryClient.clear()
    const key = draftKey(scenario.id, tweet.id)
    useDrafts.getState().put(key, { ...draftOf(tweet), title: 'Angry traveller (edited)' })
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PendingSavesNote scenarioId={scenario.id} />
          <InjectDeck projectPath={PROJECT} scenario={scenario} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const deck = await screen.findByRole('grid', { name: 'Inject deck' })
    const link = await within(deck).findByRole('link', { name: 'Angry traveller' })
    const card = link.closest('[role="row"]') as HTMLElement
    expect(within(card).getByText('Draft')).toBeTruthy()
    expect(screen.getByText('1 inject has an unsaved draft')).toBeTruthy()
    expect(unsavedItems()).toContain('1 unsaved inject draft')
    // A draft identical to the saved copy is no draft.
    act(() => useDrafts.getState().put(key, draftOf(tweet)))
    expect(within(card).queryByText('Draft')).toBeNull()
    act(() => useDrafts.getState().drop(key))
    expect(screen.queryByText(/unsaved draft/)).toBeNull()
  })
})
