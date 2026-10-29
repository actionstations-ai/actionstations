// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { Scenario, type LintWarning } from '@shared/schemas/scenario'
import fixture from '../../../../../tests/fixtures/scenarios/scenario-3.json'
import { FakeIpcError, PROJECT, mockTtx, type Handlers } from '../../routes/documents/test-utils'
import { queryClient } from '../../lib/query'
import { pendingKey, usePendingSaves } from '../docs/pending-saves'
import { flushAndListUnsaved, unsavedItems } from '../unsaved-work'
import { MselEditor } from './MselEditor'
import { SAVE_DEBOUNCE_MS } from './use-msel-editor'

const base = Scenario.parse(fixture)

type Saved = { scenario: Scenario; note?: string }

function setup(opts: { handlers?: Handlers; lint?: LintWarning[]; scenario?: Scenario } = {}) {
  const scenario = opts.scenario ?? base
  let n = 0
  const ttx = mockTtx({
    'scenarios:lint': () => opts.lint ?? [],
    'scenarios:save': (req: Saved) => ({
      ...req.scenario,
      updatedAt: `2026-11-01T00:00:${String(++n).padStart(2, '0')}.000Z`,
    }),
    ...opts.handlers,
  })
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <MselEditor projectPath={PROJECT} scenario={scenario} />
    </QueryClientProvider>,
  )
  const saves = () => ttx.calls('scenarios:save') as Saved[]
  const lastSaved = () => saves().at(-1)!.scenario
  return { ttx, saves, lastSaved, user: userEvent.setup() }
}

const grid = () => screen.getByRole('grid', { name: 'Master Scenario Events List' })
const rowWith = (id: string) =>
  within(grid())
    .getAllByRole('row')
    .find((r) => r.querySelector('.msel-editor__id')?.textContent === id)!
const cell = (id: string, col: string) =>
  rowWith(id).querySelector<HTMLElement>(`[data-col="${col}"]`)!
const savedRow = (s: Scenario, id: string) => s.msel.find((r) => r.id === id)!

afterEach(() => cleanup())

describe('MselEditor', () => {
  it('renders phases with goals and every row in an ARIA grid', () => {
    setup()
    expect(within(grid()).getAllByRole('row')).toHaveLength(1 + 4 + 24)
    expect(screen.getByText(/Goal: To force the transition/)).toBeTruthy()
    expect(within(rowWith('I-05b')).getByText('Red herring')).toBeTruthy()
    expect(within(rowWith('START')).getByText('TIRP 13.6')).toBeTruthy()
    expect(cell('START', 'citations').querySelector('[title]')?.getAttribute('title')).toContain(
      'TIRP › Section 13 › 13.6 Scenario C',
    )
    // One tab stop: the first row's time cell.
    expect(grid().querySelectorAll('[tabindex="0"]')).toHaveLength(1)
    expect(cell('START', 'time').tabIndex).toBe(0)
  })

  it('edits a time and an event with the keyboard and saves once, debounced', async () => {
    const { user, saves, lastSaved } = setup()
    cell('I-01', 'time').focus()
    await user.keyboard('{Enter}')
    const input = screen.getByRole('textbox', { name: 'Time for I-01' })
    await user.clear(input)
    await user.type(input, '0:40{Tab}')
    // Tab committed and opened the next editable cell (ID).
    expect(screen.getByRole('textbox', { name: 'Row ID' })).toBeTruthy()
    await user.keyboard('{Escape}')
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{F2}')
    const event = screen.getByRole('textbox', { name: 'Event for I-01' })
    await user.clear(event)
    await user.type(event, 'Gate B4 screen says Miami.{Enter}')
    expect(within(rowWith('I-01')).getByText('Gate B4 screen says Miami.')).toBeTruthy()
    await waitFor(() => expect(saves()).toHaveLength(1), { timeout: 2000 })
    expect(saves()[0]!.note).toBe('MSEL edit')
    expect(savedRow(lastSaved(), 'I-01')).toMatchObject({
      time: '0:40',
      wallClock: '09:40',
      event: 'Gate B4 screen says Miami.',
    })
    // Re-sorted: 0:40 sits between I-02 (0:30) and I-03 (0:45).
    expect(
      lastSaved()
        .msel.slice(0, 6)
        .map((r) => r.id),
    ).toEqual(['START', 'I-02a', 'I-02', 'I-01', 'I-03', 'I-04'])
  })

  it('rejects an invalid time but keeps editing; Escape cancels', async () => {
    const { user, saves } = setup()
    cell('I-02', 'time').focus()
    await user.keyboard('{Enter}')
    const input = screen.getByRole('textbox', { name: 'Time for I-02' })
    await user.clear(input)
    await user.type(input, 'noon{Enter}')
    expect(screen.getByRole('alert').textContent).toMatch(/Use H:MM/)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Time for I-02' })).toBeNull()
    expect(within(cell('I-02', 'time')).getByText('0:30')).toBeTruthy()
    expect(document.activeElement).toBe(cell('I-02', 'time'))
    expect(saves()).toHaveLength(0)
  })

  it('warns, without blocking, when a time leaves its phase window', async () => {
    const { user, saves, lastSaved } = setup()
    cell('I-03', 'time').focus()
    await user.keyboard('{Enter}')
    const input = screen.getByRole('textbox', { name: 'Time for I-03' })
    await user.clear(input)
    await user.type(input, '1:20{Enter}')
    expect(within(cell('I-03', 'time')).getByText(/1:20 is outside Phase 1/)).toBeTruthy()
    await waitFor(() => expect(saves()).toHaveLength(1), { timeout: 2000 })
    expect(savedRow(lastSaved(), 'I-03').time).toBe('1:20')
  })

  it('picks tags and recipients from listboxes', async () => {
    const { user, lastSaved, saves } = setup()
    cell('I-04', 'tag').focus()
    await user.keyboard('{Enter}')
    const tags = screen.getByRole('listbox', { name: 'Tag for I-04' })
    await user.click(within(tags).getByText('Decision point'))
    cell('I-04', 'to').focus()
    await user.keyboard('{Enter}')
    const to = screen.getByRole('listbox', { name: 'To for I-04' })
    expect(within(to).getByRole('option', { name: /PIO/, selected: true })).toBeTruthy()
    // The list opens on the current recipient (PIO); ArrowDown → ASC, Space toggles, Enter saves.
    await user.keyboard('{ArrowDown} {Enter}')
    expect(within(rowWith('I-04')).getByText('PIO, ASC')).toBeTruthy()
    await waitFor(() => expect(saves().length).toBeGreaterThan(0), { timeout: 2000 })
    await waitFor(() =>
      expect(savedRow(lastSaved(), 'I-04')).toMatchObject({
        purposeTag: 'DECISION_POINT',
        toRoleIds: ['pio', 'asc'],
      }),
    )
  })

  it('bulk-shifts a whole phase by +10 minutes', async () => {
    const { user, lastSaved, saves } = setup()
    await user.click(
      screen.getByRole('checkbox', { name: 'Select all rows in Phase 3: Manual Mode' }),
    )
    const bulk = screen.getByRole('region', { name: 'Selected rows' })
    expect(within(bulk).getByText('5 rows selected')).toBeTruthy()
    const delta = within(bulk).getByRole('spinbutton', { name: 'Shift times by' })
    await user.clear(delta)
    await user.type(delta, '10')
    await user.click(within(bulk).getByRole('button', { name: 'Shift' }))
    await waitFor(() => expect(saves()).toHaveLength(1), { timeout: 2000 })
    const p3 = lastSaved().msel.filter((r) => r.phaseId === 'p3')
    expect(p3.map((r) => r.time)).toEqual(['2:10', '2:25', '2:30', '2:40', '2:55'])
  })

  it('selects a range with shift-click', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('checkbox', { name: 'Select I-01' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select I-04' }), { shiftKey: true })
    expect(screen.getByRole('region', { name: 'Selected rows' }).textContent).toContain(
      '5 rows selected',
    )
  })

  it('undoes and redoes with Ctrl+Z / Ctrl+Shift+Z', async () => {
    const { user } = setup()
    cell('I-02', 'from').focus()
    await user.keyboard('{Enter}')
    const from = screen.getByRole('textbox', { name: 'From for I-02' })
    await user.clear(from)
    await user.type(from, 'SOC{Enter}')
    expect(within(cell('I-02', 'from')).getByText('SOC')).toBeTruthy()
    await user.keyboard('{Control>}z{/Control}')
    expect(within(cell('I-02', 'from')).getByText('IT Helpdesk')).toBeTruthy()
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    expect(within(cell('I-02', 'from')).getByText('SOC')).toBeTruthy()
  })

  it('keeps edits on CONFLICT, shows a banner and retries after job:done', async () => {
    let busy = true
    const { user, ttx, saves, lastSaved } = setup({
      handlers: {
        'scenarios:save': (req: Saved) => {
          if (busy) throw new FakeIpcError('CONFLICT', 'Generation is running for this scenario')
          return { ...req.scenario, updatedAt: '2026-11-02T00:00:00.000Z' }
        },
      },
    })
    cell('I-02', 'from').focus()
    await user.keyboard('{Enter}')
    const from = screen.getByRole('textbox', { name: 'From for I-02' })
    await user.clear(from)
    await user.type(from, 'SOC{Enter}')
    const banner = await screen.findByText(
      /Generation is running for this scenario. Your edits/,
      undefined,
      {
        timeout: 2000,
      },
    )
    expect(banner).toBeTruthy()
    expect(within(cell('I-02', 'from')).getByText('SOC')).toBeTruthy()
    busy = false
    act(() => ttx.emit('job:done', { jobId: 'J1', kind: 'generate-scenario', status: 'done' }))
    await waitFor(() => expect(saves()).toHaveLength(2), { timeout: 2000 })
    expect(savedRow(lastSaved(), 'I-02').from).toBe('SOC')
    await waitFor(() => expect(screen.queryByText(/Your edits are kept/)).toBeNull())
    expect(screen.getByText('All changes saved')).toBeTruthy()
  })

  it('shows lint warnings per row and jumps to a row from the summary', async () => {
    const { user } = setup({
      lint: [
        {
          code: 'ROW_OUTSIDE_PHASE',
          severity: 'warning',
          message: 'Row I-05b is late',
          rowId: 'I-05b',
          source: 'lint',
        },
        { code: 'NO_CLUE', severity: 'info', message: 'Phase 4 has no CLUE', source: 'lint' },
      ],
    })
    expect(await screen.findByText('Lint: 1 warning · 1 info')).toBeTruthy()
    expect(within(rowWith('I-05b')).getByText(/1 warning: Row I-05b is late/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show details' }))
    await user.click(screen.getByRole('button', { name: 'I-05b' }))
    await waitFor(() => expect(document.activeElement).toBe(cell('I-05b', 'id')))
  })

  it('confirms before deleting a row with an inject and says the file is kept', async () => {
    const scenario = {
      ...base,
      msel: base.msel.map((r) => (r.id === 'I-07' ? { ...r, injectId: 'inj-07' } : r)),
    }
    const { user, lastSaved, saves } = setup({ scenario })
    await user.click(screen.getByRole('button', { name: 'Actions for I-07' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Delete row…' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/inject file stays in the project/)).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Delete row' }))
    await waitFor(() => expect(saves()).toHaveLength(1), { timeout: 2000 })
    expect(lastSaved().msel.some((r) => r.id === 'I-07')).toBe(false)
  })

  it('inserts a time jump card from the toolbar', async () => {
    const { user, lastSaved, saves } = setup()
    await user.click(screen.getByRole('button', { name: 'Insert control card' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Time jump…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Insert time jump' })
    await user.selectOptions(within(dialog).getByLabelText('Phase'), 'p3')
    const wall = within(dialog).getByLabelText('New wall-clock time')
    expect((wall as HTMLInputElement).value).toBe('11:00')
    await user.clear(wall)
    await user.type(wall, '11:30')
    await user.type(within(dialog).getByLabelText('Narration'), 'Lines reach the curb.')
    await user.click(within(dialog).getByRole('button', { name: 'Insert time jump' }))
    await waitFor(() => expect(saves()).toHaveLength(1), { timeout: 2000 })
    expect(savedRow(lastSaved(), 'TJ-1')).toMatchObject({
      phaseId: 'p3',
      time: '2:00',
      wallClock: '11:30',
      purposeTag: 'TIME_JUMP',
      event: 'SCENARIO JUMP: It is now 11:30 AM. Lines reach the curb.',
    })
  })

  it('previews and applies renumbering', async () => {
    const scenario = {
      ...base,
      msel: base.msel.map((r) => (r.id === 'I-03' ? { ...r, id: 'I-30' } : r)),
    }
    const { user, lastSaved, saves } = setup({ scenario })
    await user.click(screen.getByRole('button', { name: 'Renumber IDs…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Renumber inject IDs' })
    const preview = within(dialog).getByRole('table', { name: 'Renumber preview' })
    expect(within(preview).getByText('I-30')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: 'Renumber 1 row' }))
    await waitFor(() => expect(saves()).toHaveLength(1), { timeout: 2000 })
    expect(lastSaved().msel.map((r) => r.id)).toContain('I-03')
  })

  it('previews a snapshot diff and restores it', async () => {
    const older = { ...base, msel: base.msel.filter((r) => r.id !== 'I-05b') }
    const { user, ttx } = setup({
      handlers: {
        'scenarios:history': () => [
          { id: 'h1', at: '2026-10-21T10:00:00.000Z', by: 'ai', note: 'Generated' },
        ],
        'scenarios:history-get': () => ({ scenario: older }),
        'scenarios:history-restore': () => undefined,
        'scenarios:get': () => ({ ...older, updatedAt: '2026-11-03T00:00:00.000Z' }),
      },
    })
    await user.click(screen.getByRole('button', { name: 'History' }))
    const dialog = await screen.findByRole('dialog', { name: 'Scenario history' })
    await user.click(await within(dialog).findByRole('button', { name: 'Preview' }))
    expect(await within(dialog).findByText('23 rows; drops I-05b.')).toBeTruthy()
    await user.click(within(dialog).getByRole('button', { name: /^Restore snapshot/ }))
    await waitFor(() => expect(ttx.calls('scenarios:history-restore')).toHaveLength(1))
    await waitFor(() => expect(within(grid()).getAllByRole('row')).toHaveLength(1 + 4 + 23))
  })

  it('hides preview when the snapshot cannot be loaded', async () => {
    const { user } = setup({
      handlers: {
        'scenarios:history': () => [{ id: 'h1', at: '2026-10-21T10:00:00.000Z', by: 'user' }],
      },
    })
    await user.click(screen.getByRole('button', { name: 'History' }))
    const dialog = await screen.findByRole('dialog', { name: 'Scenario history' })
    await user.click(await within(dialog).findByRole('button', { name: 'Preview' }))
    await waitFor(() =>
      expect(within(dialog).queryByRole('button', { name: 'Preview' })).toBeNull(),
    )
    expect(within(dialog).getByRole('button', { name: /^Restore snapshot/ })).toBeTruthy()
  })
})

describe('MselEditor save integrity', () => {
  type SaveReq = Saved & { baseUpdatedAt?: string }

  async function editFrom(user: ReturnType<typeof userEvent.setup>, value: string) {
    cell('I-02', 'from').focus()
    await user.keyboard('{Enter}')
    const from = screen.getByRole('textbox', { name: 'From for I-02' })
    await user.clear(from)
    await user.type(from, `${value}{Enter}`)
  }

  afterEach(() => usePendingSaves.setState({ entries: {} }))

  it('saves a pending edit exactly once when the editor unmounts before the debounce (#193)', async () => {
    const { user, saves } = setup()
    await editFrom(user, 'SOC')
    expect(saves()).toHaveLength(0)
    cleanup()
    await waitFor(() => expect(saves()).toHaveLength(1))
    const req = saves()[0] as SaveReq
    expect(savedRow(req.scenario, 'I-02').from).toBe('SOC')
    expect(req.baseUpdatedAt).toBe(base.updatedAt)
    // Nothing else fires later (the debounce timer is gone with the editor).
    await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_MS + 100))
    expect(saves()).toHaveLength(1)
  })

  it('parks the edit when unmounted during generation and takes it back on reopen (#193)', async () => {
    let busy = true
    const { user, saves } = setup({
      handlers: {
        'scenarios:save': (req: Saved) => {
          if (busy) throw new FakeIpcError('CONFLICT', 'Generation is running for this scenario')
          return { ...req.scenario, updatedAt: '2026-11-03T00:00:00.000Z' }
        },
      },
    })
    await editFrom(user, 'SOC')
    cleanup()
    const key = pendingKey(PROJECT, base.id, 'msel')
    await waitFor(() => expect(usePendingSaves.getState().entries[key]?.label).toBe('MSEL'))
    busy = false
    // Reopening the MSEL takes the edit back and saves it itself.
    render(
      <QueryClientProvider client={queryClient}>
        <MselEditor projectPath={PROJECT} scenario={base} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(within(cell('I-02', 'from')).getByText('SOC')).toBeTruthy())
    expect(usePendingSaves.getState().entries[key]).toBeUndefined()
    await waitFor(() => expect(saves().length).toBeGreaterThanOrEqual(2), { timeout: 2000 })
    expect(savedRow(saves().at(-1)!.scenario, 'I-02').from).toBe('SOC')
  })

  it('redoes a stale save onto the newer scenario instead of overwriting it (#199)', async () => {
    const newer = { ...base, title: 'Retitled by a job', updatedAt: '2026-11-05T00:00:00.000Z' }
    const { user, saves, lastSaved } = setup({
      handlers: {
        'scenarios:get': () => newer,
        'scenarios:save': (req: SaveReq) => {
          if (req.baseUpdatedAt !== newer.updatedAt)
            throw new FakeIpcError('CONFLICT', 'This scenario changed', { reason: 'stale' })
          return { ...req.scenario, updatedAt: '2026-11-06T00:00:00.000Z' }
        },
      },
    })
    await editFrom(user, 'SOC')
    await waitFor(() => expect(saves()).toHaveLength(2), { timeout: 2000 })
    expect((saves()[1] as SaveReq).baseUpdatedAt).toBe(newer.updatedAt)
    expect(lastSaved().title).toBe('Retitled by a job')
    expect(savedRow(lastSaved(), 'I-02').from).toBe('SOC')
    expect(await screen.findByText('All changes saved')).toBeTruthy()
  })

  it('reports an unsaved edit before quit and saves it on flush (#196)', async () => {
    const { user, saves } = setup()
    await editFrom(user, 'SOC')
    expect(unsavedItems()).toContain('MSEL')
    expect(await flushAndListUnsaved()).not.toContain('MSEL')
    expect(saves()).toHaveLength(1)
  })
})

describe('MselEditor in a regional exercise (#497)', () => {
  const regionalState = {
    thisOrg: 'city',
    orgs: [
      { orgId: 'air', name: 'Harborview Airport Authority', prefix: 'AIR' },
      { orgId: 'city', name: 'Cleveland Office of Emergency Management', prefix: 'CITY' },
    ],
  }
  const withPartnerRow = (): Scenario => ({
    ...base,
    msel: base.msel.map((r) => (r.id === 'I-01' ? { ...r, owner: 'air', revision: 2 } : r)),
  })
  const regional = () =>
    setup({ scenario: withPartnerRow(), handlers: { 'regional:state': () => regionalState } })

  it('badges a partner row with its owner in words, and not its own rows', async () => {
    regional()
    expect(await within(rowWith('I-01')).findByText(/Owned by AIR/)).toBeTruthy()
    expect(within(rowWith('I-01')).getByText(/Harborview Airport Authority/)).toBeTruthy()
    expect(within(rowWith('I-02')).queryByText(/Owned by/)).toBeNull()
  })

  it('does not open an editor on a partner row, so nothing is saved', async () => {
    const { user, saves } = regional()
    await within(rowWith('I-01')).findByText(/Owned by AIR/)
    cell('I-01', 'time').focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('textbox', { name: 'Time for I-01' })).toBeNull()
    expect(within(rowWith('I-01')).getByRole('checkbox', { name: 'Select I-01' })).toHaveProperty(
      'disabled',
      true,
    )
    await new Promise((r) => setTimeout(r, SAVE_DEBOUNCE_MS + 100))
    expect(saves()).toHaveLength(0)
  })

  it('still edits the rows this organization owns', async () => {
    const { user } = regional()
    await within(rowWith('I-01')).findByText(/Owned by AIR/)
    cell('I-02', 'time').focus()
    await user.keyboard('{Enter}')
    expect(screen.getByRole('textbox', { name: 'Time for I-02' })).toBeTruthy()
  })

  it('has no axe violations with a partner row', async () => {
    regional()
    await within(rowWith('I-01')).findByText(/Owned by AIR/)
    const rules = { 'color-contrast': { enabled: false }, region: { enabled: false } }
    const { violations } = await axe.run(document.body, { rules })
    expect(violations.map((v) => v.id)).toEqual([])
  })
})
