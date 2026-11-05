// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WARNING_FORM } from '../../../shared/decisions/fixtures'
import { createWebCryptoProvider } from '../../../shared/live/crypto/webcrypto'
import { MemoryKeyValue } from '../../../shared/live/transport'
import type { DecisionForm } from '../../../shared/schemas/decisions'
import { DEFAULT_PREFS } from '../../app/prefs'
import { PlayerSession } from '../../app/session'
import { MoreScreen } from '../../screens/MoreScreen'
import { Store } from '../../app/store'
import { DecisionsScreen } from './DecisionsScreen'

const OTHER_FORM: DecisionForm = {
  id: 'order-evac',
  title: 'Order an evacuation',
  seats: ['harbor-master'],
  fields: [{ id: 'note', type: 'text', label: 'Note', required: false, maxLength: 200 }],
}

function setup(opts: { forms?: DecisionForm[]; roleId?: string; online?: boolean } = {}) {
  const session = new PlayerSession({
    url: 'http://127.0.0.1/s/session-00000000000000#x',
    crypto: createWebCryptoProvider(),
    storage: new MemoryKeyValue(),
    connect: () => {
      throw new Error('not in this test')
    },
    announcer: { announce: () => {} },
    prefs: () => DEFAULT_PREFS,
    bundleVersion: 'test',
  })
  const enqueue = vi.fn(async (action: { type: string; payload: Record<string, unknown> }) => {
    if (opts.online) (session as unknown as { afterSend: (a: unknown) => void }).afterSend(action)
  })
  Object.assign(session, { outbox: { enqueue } })
  const forms = opts.forms ?? [WARNING_FORM, OTHER_FORM]
  session.store.set({
    phase: 'seated',
    connection: 'connected',
    clientId: 'playerA-00000000000000',
    seat: {
      kind: 'player',
      role: { id: opts.roleId ?? 'pio', name: 'PIO', abbreviation: '', teamId: 'comms' },
    },
    decisionForms: Object.fromEntries(forms.map((f) => [f.id, f])),
  })
  const onBack = vi.fn()
  render(<DecisionsScreen session={session} onBack={onBack} />)
  return { session, enqueue, onBack }
}

afterEach(() => cleanup())

const sent = (enqueue: ReturnType<typeof setup>['enqueue']) => enqueue.mock.calls[0]![0] as never

describe('DecisionsScreen', () => {
  it('lists only the forms for this seat', () => {
    setup()
    expect(screen.getByRole('button', { name: /Issue a warning/ })).toBeTruthy()
    expect(screen.queryByText('Order an evacuation')).toBeNull()
  })

  it('says so when the seat has no forms', () => {
    setup({ roleId: 'finance' })
    expect(screen.getByText('No decision forms for your seat.')).toBeTruthy()
  })

  it('fills in a form with the keyboard and queues the decision for the controller', async () => {
    const { enqueue, session } = setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Issue a warning/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Issue a warning' })).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: 'Warning' }))
    await user.selectOptions(screen.getByLabelText(/^Area/), 'harbor')
    await user.type(screen.getByLabelText(/Effective at/), '1:30')
    await user.type(screen.getByLabelText(/People affected/), '40')
    await user.type(screen.getByLabelText(/^Note/), 'Sirens on')
    await user.click(screen.getByRole('button', { name: 'Send decision' }))

    expect(enqueue).toHaveBeenCalledTimes(1)
    const action = sent(enqueue) as {
      type: string
      to: string
      payload: Record<string, unknown>
    }
    expect(action).toMatchObject({ type: 'decision.submit', to: 'controller' })
    expect(action.payload).toMatchObject({
      formId: 'issue-warning',
      fields: [
        { fieldId: 'level', value: 'warning' },
        { fieldId: 'effective', value: '1:30' },
        { fieldId: 'people', value: 40 },
        { fieldId: 'note', value: 'Sirens on' },
      ],
      area: { areaId: 'harbor' },
    })
    expect(String(action.payload.decisionId)).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(session.state.decisions[0]).toMatchObject({ formId: 'issue-warning', sent: false })
    expect(screen.getByRole('status').textContent).toContain(
      'It will be sent when you are back online',
    )
    // Back on the list, with the decision shown as waiting.
    expect(screen.getByText('Waiting to send')).toBeTruthy()
  })

  it('says it was sent when the connection took it', async () => {
    setup({ online: true })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Issue a warning/ }))
    await user.click(screen.getByRole('radio', { name: 'Watch' }))
    await user.selectOptions(screen.getByLabelText(/^Area/), 'north')
    await user.click(screen.getByRole('button', { name: 'Send decision' }))
    expect(screen.getByRole('status').textContent).toBe('Sent: Issue a warning')
  })

  it('names what is missing or wrong, focuses the first one and sends nothing', async () => {
    const { enqueue } = setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Issue a warning/ }))
    await user.type(screen.getByLabelText(/Effective at/), '25')
    await user.click(screen.getByRole('button', { name: 'Send decision' }))
    expect(screen.getByRole('alert').textContent).toBe('3 answers need a look.')
    expect(enqueue).not.toHaveBeenCalled()
    expect(document.activeElement?.getAttribute('name')).toBe('dec-level')
    const area = screen.getByLabelText(/^Area/)
    expect(area.getAttribute('aria-invalid')).toBe('true')
    expect(
      document.getElementById(area.getAttribute('aria-describedby')!.split(' ').pop()!)
        ?.textContent,
    ).toBe('Area is required')
  })

  it('offers the area as a list even when the form allows drawing', async () => {
    setup()
    await userEvent.setup().click(screen.getByRole('button', { name: /Issue a warning/ }))
    const area = screen.getByLabelText(/^Area/)
    expect(area.tagName).toBe('SELECT')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose…',
      'North district',
      'Harbor',
    ])
  })

  it('has touch targets of at least 44px (set in the page styles)', async () => {
    const css = (await import('node:fs')).readFileSync('src/player/styles/player.css', 'utf8')
    expect(css).toMatch(/\.field__input\s*{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.vote-option\s*{[^}]*min-height:\s*44px/)
  })

  it('has no axe violations in the list, the form and with errors showing', async () => {
    setup()
    const run = () =>
      axe.run(document.body, {
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
      })
    expect((await run()).violations.map((v) => v.id)).toEqual([])
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Issue a warning/ }))
    expect((await run()).violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Send decision' }))
    expect((await run()).violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([])
  })
})

describe('Decisions under More', () => {
  const more = (forms: DecisionForm[]) => {
    const session = new PlayerSession({
      url: 'http://127.0.0.1/s/session-00000000000000#x',
      crypto: createWebCryptoProvider(),
      storage: new MemoryKeyValue(),
      connect: () => {
        throw new Error('not in this test')
      },
      announcer: { announce: () => {} },
      prefs: () => DEFAULT_PREFS,
      bundleVersion: 'test',
    })
    session.store.set({
      phase: 'seated',
      seat: {
        kind: 'player',
        role: { id: 'pio', name: 'PIO', abbreviation: '', teamId: 'comms' },
      },
      decisionForms: Object.fromEntries(forms.map((f) => [f.id, f])),
    })
    render(
      <MoreScreen session={session} prefsStore={new Store(DEFAULT_PREFS)} bundleVersion="test" />,
    )
  }

  it('opens when the seat has a form and is disabled with a reason when it has none', async () => {
    more([OTHER_FORM])
    const off = screen.getByRole('button', { name: /Decisions/ })
    expect(off.getAttribute('aria-disabled')).toBe('true')
    expect(off.textContent).toContain('No decision forms for your seat.')
    cleanup()
    more([WARNING_FORM])
    await userEvent.setup().click(screen.getByRole('button', { name: /Decisions/ }))
    expect(screen.getByRole('heading', { level: 1, name: 'Decisions' })).toBeTruthy()
  })
})
