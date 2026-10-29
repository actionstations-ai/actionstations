// @vitest-environment happy-dom
// The Controls dialog of an MSEL row (#426): suggestions are chips to accept or dismiss, the
// picker adds any control, and the model button exists only when the project allows it.
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Framework } from '@shared/schemas/compliance'
import { MselRow } from '@shared/schemas/scenario'
import nist from '../../../../../packs/frameworks/nist_csf_2.json'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../../routes/documents/test-utils'
import { ControlsDialog } from './ControlsDialog'

const source = { layer: 'bundled' as const }
const framework = Framework.parse(nist)
const row = (extra: Partial<MselRow> = {}) =>
  MselRow.parse({
    id: 'I-07',
    phaseId: 'P1',
    time: '1:00',
    from: 'SimCell',
    event: 'The SOC sees beaconing from a baggage server',
    expectedAction: 'Decide whether to isolate it',
    purposeTag: 'CLUE',
    ...extra,
  })

let jobs = 0
function setup(r: MselRow, modelMapping = false) {
  jobs = 0
  const ttx = mockTtx({
    'compliance:list': () => ({
      regulations: [],
      frameworks: [{ framework, enabled: true, suggested: true, source }],
      modelMapping,
    }),
    'compliance:model-info': () => ({
      providerLabel: 'Local model',
      local: true,
      reason: 'Local.',
    }),
    'compliance:suggest-model': () => ({ jobId: `J${++jobs}` }),
  })
  const onSave = vi.fn()
  queryClient.clear()
  render(
    <QueryClientProvider client={queryClient}>
      <ControlsDialog
        projectPath="/p"
        scenarioId="s1"
        row={r}
        threatFamily="cyber"
        onCancel={() => undefined}
        onSave={onSave}
      />
    </QueryClientProvider>,
  )
  return { ttx, onSave, user: userEvent.setup() }
}

afterEach(() => cleanup())

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }

describe('ControlsDialog', () => {
  it('lists the rule suggestions as chips and accepts one', async () => {
    const { user, onSave } = setup(row())
    const suggested = await screen.findByRole('list', { name: 'Suggested controls' })
    expect(within(suggested).getAllByRole('listitem').length).toBeGreaterThan(0)
    const accept = within(suggested).getAllByRole('button', { name: /^Accept / })[0]!
    const name = accept.getAttribute('aria-label')!.replace('Accept ', '')
    await user.click(accept)
    expect(
      within(screen.getByRole('list', { name: 'Accepted controls' })).getByText(name),
    ).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const saved = onSave.mock.calls[0]![0]
    expect(saved.controls).toHaveLength(1)
    expect(
      saved.controlSuggestions.some((s: { ref: string }) => name.startsWith(s.ref.split(':')[1]!)),
    ).toBe(false)
  })

  it('a dismissed suggestion stays dismissed once saved', async () => {
    const { user, onSave } = setup(row())
    const suggested = await screen.findByRole('list', { name: 'Suggested controls' })
    const dismiss = within(suggested).getAllByRole('button', { name: /^Dismiss / })[0]!
    const before = within(suggested).getAllByRole('listitem').length
    await user.click(dismiss)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]![0].controlSuggestions).toHaveLength(before - 1)
  })

  it('adds a control from the picker and removes an accepted one', async () => {
    const { user, onSave } = setup(row({ controls: ['nist_csf_2:RS.CO-02'] }))
    await screen.findByRole('list', { name: 'Accepted controls' })
    await user.type(screen.getByLabelText('Add a control'), 'RS.MA-01')
    await user.click(await screen.findByRole('button', { name: /^Add RS\.MA-01/ }))
    await user.click(screen.getByRole('button', { name: /^Remove RS\.CO-02/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave.mock.calls[0]![0].controls).toEqual(['nist_csf_2:RS.MA-01'])
  })

  it('has no model button unless the project allows model mapping', async () => {
    setup(row())
    await screen.findByRole('list', { name: 'Suggested controls' })
    expect(screen.queryByRole('button', { name: /Suggest controls/ })).toBeNull()
  })

  it('asks the model for this row only, and shows its answer as suggestions, not accepted', async () => {
    const { ttx, user } = setup(row({ purposeTag: 'NOISE' }), true)
    await user.click(
      await screen.findByRole('button', { name: /Suggest controls with Local model/ }),
    )
    expect(ttx.calls('compliance:suggest-model')[0]).toEqual({
      projectPath: '/p',
      scenarioId: 's1',
      rowIds: ['I-07'],
    })
    ttx.emit('job:done', {
      jobId: 'J1',
      kind: 'compliance-map',
      status: 'done',
      result: { suggestions: [{ rowId: 'I-07', ref: 'nist_csf_2:RS.CO-02' }] },
    })
    const suggested = await screen.findByRole('list', { name: 'Suggested controls' })
    expect(within(suggested).getByText(/RS\.CO-02/)).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Accepted controls' })).toBeNull()
  })

  it('has no axe violations', async () => {
    setup(row({ controls: ['nist_csf_2:RS.CO-02'] }), true)
    await screen.findByRole('list', { name: 'Accepted controls' })
    await waitFor(async () =>
      expect((await axe.run(screen.getByRole('dialog'), AXE)).violations.map((v) => v.id)).toEqual(
        [],
      ),
    )
  })
})
