// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PartnerStatus, RegionalRosterView } from '@shared/schemas/live'
import { CoControllersView, PartnerInviteBox } from './CoControllers'
import { mineOf } from './partner-model'
import { PartnerJoinForm, PartnerRows } from './PartnerSession'
import { SimcellHelpersCard } from './SimcellHelpers'

afterEach(cleanup)

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const noViolations = async () =>
  expect((await axe.run(document.body, AXE)).violations.map((v) => v.id)).toEqual([])

const rows = [
  { id: 'AIR-1', event: 'A board goes dark', toRoleIds: ['ops'], toLabel: 'Ops' },
  { id: 'AIR-2', event: 'Gate agent calls', toRoleIds: ['ops'], toLabel: '' },
  { id: 'CITY-1', event: 'Not ours', toRoleIds: ['pio'], toLabel: '' },
]
const status = (over: Partial<PartnerStatus> = {}): PartnerStatus => ({
  state: 'joined',
  orgId: 'air',
  orgName: 'Airport Authority',
  scope: { rowPrefixes: ['AIR'], roleIds: ['ops'], permissions: ['inject'] },
  releases: [],
  ...over,
})

describe('partner rows', () => {
  it('lists only rows inside the roster prefixes', () => {
    expect(mineOf(rows, status()).map((r) => r.id)).toEqual(['AIR-1', 'AIR-2'])
    expect(mineOf(rows, status({ scope: undefined }))).toEqual([])
  })

  it('releases a row on request, and shows receipts for one already out', () => {
    const onRelease = vi.fn()
    const released = {
      releaseId: 'r'.repeat(22),
      rowId: 'AIR-2',
      targets: ['role:ops'],
      withdrawn: false,
      perClient: [],
      counts: { to: 2, delivered: 2, read: 1, actioned: 0 },
    }
    render(
      <PartnerRows
        rows={rows}
        status={status({ releases: [released] })}
        busy={false}
        onRelease={onRelease}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Release AIR-1' }))
    expect(onRelease).toHaveBeenCalledWith('AIR-1')
    const second = screen.getByRole('row', { name: /AIR-2/ })
    expect(within(second).getByRole('status').textContent).toContain('1 of 2 roles have read it')
    expect(screen.queryByRole('button', { name: 'Release AIR-2' })).toBeNull()
    expect(screen.queryByText('Not ours')).toBeNull()
  })

  it('cannot release until the host has listed the organization', () => {
    render(
      <PartnerRows
        rows={rows}
        status={status({ scope: undefined })}
        busy={false}
        onRelease={vi.fn()}
      />,
    )
    expect(screen.getByText(/no rows for your organization/)).toBeTruthy()
  })

  it('stops the release buttons while a release is in flight', () => {
    render(<PartnerRows rows={rows} status={status()} busy onRelease={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Release AIR-1' })).toHaveProperty('disabled', true)
  })
})

describe('partner join form', () => {
  it('sends the pasted invite trimmed, and shows an error in words', () => {
    const onJoin = vi.fn()
    const { rerender } = render(<PartnerJoinForm busy={false} error="" onJoin={onJoin} />)
    const join = screen.getByRole('button', { name: 'Join exercise' })
    expect(join).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('Partner invite'), {
      target: { value: '  asp1.abc \n' },
    })
    fireEvent.click(join)
    expect(onJoin).toHaveBeenCalledWith('asp1.abc')
    rerender(<PartnerJoinForm busy={false} error="This invite is damaged." onJoin={onJoin} />)
    expect(screen.getByRole('alert').textContent).toBe('This invite is damaged.')
  })

  it('has no axe violations', async () => {
    render(<PartnerJoinForm busy={false} error="Bad" onJoin={vi.fn()} />)
    await noViolations()
  })
})

describe('partner invite', () => {
  const view: RegionalRosterView = {
    sent: true,
    revision: 1,
    controllers: [
      {
        id: 'air',
        name: 'Airport Authority',
        rowPrefixes: ['AIR'],
        roleCount: 2,
        permissions: ['inject', 'vote'],
      },
    ],
    missingLiveKey: [],
  }

  it('states what each partner may send, in words, and offers one invite button per partner', () => {
    const onInvite = vi.fn()
    render(<CoControllersView view={view} busy={false} onSend={vi.fn()} onInvite={onInvite} />)
    expect(screen.getByText('Its own injects, Votes for its roles')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Invite Airport Authority' }))
    expect(onInvite).toHaveBeenCalledWith('air')
  })

  it('shows the secret once with a warning and clears on request', () => {
    const onClose = vi.fn()
    render(
      <PartnerInviteBox
        invite={{ orgId: 'air', name: 'Airport Authority', invite: 'asp1.secret' }}
        onClose={onClose}
      />,
    )
    expect((screen.getByLabelText('Partner invite') as HTMLTextAreaElement).value).toBe(
      'asp1.secret',
    )
    expect(screen.getByText(/Send it only to them/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done, clear it' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    render(
      <CoControllersView
        view={view}
        busy={false}
        onSend={vi.fn()}
        onInvite={vi.fn()}
        invite={{ orgId: 'air', name: 'Airport Authority', invite: 'asp1.secret' }}
        onCloseInvite={vi.fn()}
      />,
    )
    await noViolations()
  })
})

describe('SimCell helper switch', () => {
  it('says what is on, and passes the choice up', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <SimcellHelpersCard
        view={{ enabled: false, devices: 0 }}
        busy={false}
        error=""
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain('Helper devices are off')
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Let SimCell helper devices approve replies' }),
    )
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(
      <SimcellHelpersCard
        view={{ enabled: true, devices: 2 }}
        busy={false}
        error=""
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('status').textContent).toBe('2 helper devices are connected.')
  })

  it('has no axe violations', async () => {
    render(
      <SimcellHelpersCard
        view={{ enabled: true, devices: 0 }}
        busy={false}
        error="x"
        onChange={vi.fn()}
      />,
    )
    await noViolations()
  })
})
