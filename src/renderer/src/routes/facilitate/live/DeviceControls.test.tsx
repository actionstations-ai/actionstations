// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import axe from 'axe-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LiveDevice } from '@shared/schemas/live'
import { queryClient } from '../../../lib/query'
import { mockTtx, PROJECT } from '../../documents/test-utils'
import { DeviceControls } from './DeviceControls'

afterEach(() => {
  cleanup()
})

const device = (over: Partial<LiveDevice>): LiveDevice => ({
  clientRef: 'aaaa1111',
  kind: 'player',
  label: 'Operations Director',
  staff: false,
  online: true,
  ...over,
})

function mount(devices: LiveDevice[], extra: Record<string, () => unknown> = {}) {
  queryClient.clear()
  const ttx = mockTtx({
    'live:devices': () => devices,
    'live:device-remove': () => undefined,
    'live:keys-replace': () => ({ epoch: 2 }),
    ...extra,
  } as never)
  render(
    <QueryClientProvider client={queryClient}>
      <DeviceControls projectPath={PROJECT} scenarioId="scn-1" />
    </QueryClientProvider>,
  )
  return ttx
}

describe('DeviceControls', () => {
  it('lists devices by seat with their state, and says so when none have joined', async () => {
    mount([
      device({}),
      device({
        clientRef: 'bbbb2222',
        label: 'Evaluator',
        kind: 'evaluator',
        staff: true,
        online: false,
        name: 'Kim',
      }),
    ])
    expect(await screen.findByText('Operations Director')).toBeTruthy()
    expect(screen.getByText('Evaluator (Kim)')).toBeTruthy()
    expect(screen.getByText('Staff')).toBeTruthy()
    expect(screen.getByText('Offline')).toBeTruthy()
    cleanup()
    mount([])
    expect(await screen.findByText('No devices have joined yet.')).toBeTruthy()
  })

  it('removes a device after confirming, and announces it', async () => {
    window.confirm = vi.fn(() => true)
    const ttx = mount([device({})])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Remove Operations Director' }))
    await waitFor(() =>
      expect(ttx.calls('live:device-remove')).toEqual([
        { projectPath: PROJECT, scenarioId: 'scn-1', clientRef: 'aaaa1111' },
      ]),
    )
    expect(await screen.findByText(/Device removed/)).toBeTruthy()
  })

  it('does nothing when the facilitator cancels the confirmation', async () => {
    window.confirm = vi.fn(() => false)
    const ttx = mount([device({})])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Remove Operations Director' }))
    await user.click(screen.getByRole('button', { name: 'Replace keys' }))
    expect(ttx.calls('live:device-remove')).toEqual([])
    expect(ttx.calls('live:keys-replace')).toEqual([])
  })

  it('replaces the keys after confirming', async () => {
    window.confirm = vi.fn(() => true)
    const ttx = mount([device({})])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Replace keys' }))
    await waitFor(() => expect(ttx.calls('live:keys-replace')).toHaveLength(1))
    expect(await screen.findByText(/Keys replaced/)).toBeTruthy()
  })

  it('shows the error when the server refuses', async () => {
    window.confirm = vi.fn(() => true)
    mount([device({})], {
      'live:device-remove': () => {
        throw new Error('That device is no longer in the session')
      },
    })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Remove Operations Director' }))
    expect(await screen.findByText(/no longer in the session/)).toBeTruthy()
  })

  it('has no axe violations', async () => {
    mount([device({}), device({ clientRef: 'bbbb2222', label: 'PIO' })])
    await screen.findByText('PIO')
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
