// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppSettings } from '@shared/schemas/settings'
import { TIPS } from '@shared/tips'
import { queryClient } from '../../lib/query'
import { useToasts } from '../../components/toast-store'
import { mockTtx } from '../documents/test-utils'
import { TipCard } from './TipCard'
import { resetTipSession } from './tip-state'

const INFO = {
  name: 'Action Stations',
  version: '99.0.0',
  platform: 'darwin',
  arch: 'arm64',
  electron: '45.0.0',
  userDataPath: '/tmp/x',
  isPackaged: true,
}

function setup(tips: { enabled: boolean; nextIndex: number } = { enabled: true, nextIndex: 0 }) {
  let settings = AppSettings.parse({ onboardingComplete: true, ui: { tips } })
  const ttx = mockTtx({
    'settings:get': () => settings,
    'app:info': () => INFO,
    'settings:update': (patch: { ui?: { tips?: Partial<typeof tips> } }) => {
      settings = {
        ...settings,
        ui: { ...settings.ui, tips: { ...settings.ui.tips, ...patch.ui?.tips } },
      }
      return settings
    },
    'help:open-guide': () => undefined,
  })
  queryClient.clear()
  const view = render(
    <QueryClientProvider client={queryClient}>
      <main id="main">
        <h1>Projects</h1>
        <TipCard />
      </main>
    </QueryClientProvider>,
  )
  return { ttx, view, settings: () => settings }
}

beforeEach(() => {
  resetTipSession()
  useToasts.setState({ toasts: [] })
})
afterEach(() => cleanup())

describe('TipCard', () => {
  it('shows the stored tip in a labelled region and moves the start of the next launch on', async () => {
    const { ttx } = setup({ enabled: true, nextIndex: 2 })
    const region = await screen.findByRole('region', { name: 'Tip' })
    expect(region.textContent).toContain(TIPS[2]!.text)
    await waitFor(() =>
      expect(ttx.calls('settings:update')).toContainEqual({ ui: { tips: { nextIndex: 3 } } }),
    )
  })

  it('never takes focus when it appears', async () => {
    setup()
    await screen.findByRole('region', { name: 'Tip' })
    expect(document.activeElement).toBe(document.body)
  })

  it('names the guide in the link text and opens it by tip id, not by URL', async () => {
    const { ttx } = setup()
    const link = await screen.findByRole('link', { name: `Read: ${TIPS[0]!.linkLabel}` })
    expect(link.getAttribute('href')).toMatch(
      /^https:\/\/github\.com\/actionstations-ai\/actionstations\/blob\/v99\.0\.0\/docs\/guides\//,
    )
    await userEvent.click(link)
    expect(ttx.calls('help:open-guide')).toEqual([{ tipId: TIPS[0]!.id }])
  })

  it('Next tip shows the following tip in a polite live region and keeps focus on the button', async () => {
    const { ttx } = setup()
    const next = await screen.findByRole('button', { name: 'Next tip' })
    await userEvent.click(next)
    const text = screen.getByText(TIPS[1]!.text)
    expect(text.getAttribute('aria-live')).toBe('polite')
    expect(document.activeElement).toBe(next)
    await waitFor(() =>
      expect(ttx.calls('settings:update')).toContainEqual({ ui: { tips: { nextIndex: 2 } } }),
    )
  })

  it('Hide removes the card for this session without changing the setting', async () => {
    const { settings } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Hide' }))
    expect(screen.queryByRole('region', { name: 'Tip' })).toBeNull()
    expect(settings().ui.tips.enabled).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Projects' }))
  })

  it('Turn off tips stores the choice and says where to turn them on again', async () => {
    const { settings } = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off tips' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Tip' })).toBeNull())
    expect(settings().ui.tips.enabled).toBe(false)
    expect(useToasts.getState().toasts).toMatchObject([
      { title: 'Tips are off', body: 'Turn them on again in Settings.' },
    ])
  })

  it('shows nothing when tips are turned off', async () => {
    const { ttx } = setup({ enabled: false, nextIndex: 0 })
    await waitFor(() => expect(ttx.calls('app:info')).toHaveLength(1))
    expect(screen.queryByRole('region', { name: 'Tip' })).toBeNull()
  })
})
