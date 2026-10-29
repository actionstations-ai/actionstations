// @vitest-environment happy-dom
// The update banner, the question card, Settings → Updates and the wizard checkbox (#442),
// against a fake window.ttx: no request is ever made.
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { UpdateStatus } from '@shared/ipc'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../../routes/documents/test-utils'
import { UpdatesSection } from '../../routes/settings/UpdatesSection'
import { DoneStep } from '../../routes/welcome/steps/DoneStep'
import { resetAskedThisLaunch } from './ask-state'
import { UpdateBanner } from './UpdateBanner'
import { UpdateQuestionCard } from './UpdateQuestionCard'

const latest = {
  version: '0.6.0',
  name: 'Action Stations 0.6.0',
  publishedAt: '2026-11-02T15:00:00Z',
  url: 'https://github.com/actionstations-ai/actionstations/releases/tag/v0.6.0',
  notes: '## Highlights\n\n- Update check\n\n<img src="https://evil.test/x.png">',
  assets: [],
}
const base: UpdateStatus = {
  installed: '0.5.0',
  mode: 'on',
  askedCount: 0,
  checking: false,
  newer: false,
  ahead: false,
  dismissed: false,
  notes: [],
}
const newer: UpdateStatus = {
  ...base,
  newer: true,
  lastCheckedAt: '2026-11-02T12:00:00.000Z',
  lastResult: { kind: 'ok', latest },
  notes: ['The app id changed in 0.5.1. Uninstall Action Stations 0.5.0 before installing.'],
  platformAsset: {
    name: 'actionstations-0.6.0-win-x64-setup.exe',
    checksum: 'actionstations-0.6.0-win-x64-setup.exe.sha256',
  },
}

/** A fake main that applies updates:set to the status it serves. */
function fakeMain(initial: UpdateStatus) {
  let status = initial
  const ttx = mockTtx({
    'updates:status': () => status,
    'updates:set': (req: { check?: 'on' | 'off'; dismissedVersion?: string; asked?: true }) => {
      status = {
        ...status,
        ...(req.check ? { mode: req.check } : {}),
        ...(req.dismissedVersion ? { dismissed: true } : {}),
        ...(req.asked ? { askedCount: status.askedCount + 1 } : {}),
      }
      return status
    },
    'updates:check': () => ({ ...newer, lastCheckedAt: new Date().toISOString() }),
    'updates:open': () => undefined,
  })
  return { ttx, status: () => status }
}

function show(node: ReactNode) {
  queryClient.clear()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <main id="main">
          <h1>Projects</h1>
          {node}
        </main>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => resetAskedThisLaunch())
afterEach(() => cleanup())

describe('UpdateBanner', () => {
  it('names both versions, highlights the Windows note and does not take focus', async () => {
    fakeMain(newer)
    show(<UpdateBanner />)
    const banner = await screen.findByRole('region', {
      name: 'Action Stations 0.6.0 is available (you have 0.5.0)',
    })
    expect(banner.textContent).toMatch(/Before you install:.*Uninstall Action Stations 0\.5\.0/)
    expect(document.activeElement).toBe(document.body)
  })

  it('"Not now" stores the version and hides the banner', async () => {
    const { ttx } = fakeMain(newer)
    show(<UpdateBanner />)
    await userEvent.click(await screen.findByRole('button', { name: 'Not now' }))
    expect(ttx.calls('updates:set')).toEqual([{ dismissedVersion: '0.6.0' }])
    await waitFor(() => expect(screen.queryByTestId('update-banner')).toBeNull())
  })

  it('opens the release page by name, never by URL', async () => {
    const { ttx } = fakeMain(newer)
    show(<UpdateBanner />)
    await userEvent.click(await screen.findByRole('button', { name: 'Download page' }))
    expect(ttx.calls('updates:open')).toEqual([{ target: 'release' }])
  })

  it('shows the notes as text, with the installer and its checksum file', async () => {
    fakeMain(newer)
    show(<UpdateBanner />)
    await userEvent.click(await screen.findByRole('button', { name: 'Release notes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Action Stations 0.6.0' })
    expect(dialog.textContent).toMatch(/actionstations-0\.6\.0-win-x64-setup\.exe\.sha256/)
    expect(dialog.querySelector('img')).toBeNull()
    expect(screen.getByRole('region', { name: 'Release notes' }).textContent).toMatch(
      /Update check/,
    )
  })

  it('stays hidden when the release was dismissed or is not newer', async () => {
    const { ttx } = fakeMain({ ...newer, dismissed: true })
    show(<UpdateBanner />)
    await waitFor(() => expect(ttx.calls('updates:status')).toHaveLength(1))
    expect(screen.queryByTestId('update-banner')).toBeNull()
  })
})

describe('UpdateQuestionCard', () => {
  it('asks once per launch and counts the showing', async () => {
    const { ttx } = fakeMain({ ...base, mode: 'ask' })
    show(<UpdateQuestionCard />)
    await screen.findByRole('region', { name: 'Check for new versions?' })
    await waitFor(() => expect(ttx.calls('updates:set')).toEqual([{ asked: true }]))
    expect(document.activeElement).toBe(document.body)
  })

  it('stores the answer and goes away', async () => {
    const { ttx, status } = fakeMain({ ...base, mode: 'ask' })
    show(<UpdateQuestionCard />)
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on' }))
    expect(ttx.calls('updates:set')).toContainEqual({ check: 'on' })
    expect(status().mode).toBe('on')
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Check for new versions?' })).toBeNull(),
    )
  })

  it('no longer asks after three launches', async () => {
    const { ttx } = fakeMain({ ...base, mode: 'ask', askedCount: 3 })
    show(<UpdateQuestionCard />)
    await waitFor(() => expect(ttx.calls('updates:status')).toHaveLength(1))
    expect(screen.queryByRole('region', { name: 'Check for new versions?' })).toBeNull()
    expect(ttx.calls('updates:set')).toEqual([])
  })
})

describe('Settings → Updates', () => {
  it('shows the version, says what is sent, and switches the check on', async () => {
    const { ttx } = fakeMain({ ...base, mode: 'off' })
    show(<UpdatesSection />)
    const box = (await screen.findByRole('checkbox', {
      name: 'Check for new versions when the app starts',
    })) as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(screen.getByText(/api\.github\.com/)).toBeTruthy()
    expect(screen.getByText('0.5.0')).toBeTruthy()
    await userEvent.click(box)
    expect(ttx.calls('updates:set')).toEqual([{ check: 'on' }])
  })

  it('Check now runs with the setting off, announces the result, then rests for a minute', async () => {
    const { ttx } = fakeMain({ ...base, mode: 'off' })
    show(<UpdatesSection />)
    const button = await screen.findByRole('button', { name: 'Check now' })
    await userEvent.click(button)
    expect(ttx.calls('updates:check')).toHaveLength(1)
    const result = await screen.findByTestId('update-result')
    expect(result.getAttribute('aria-live')).toBe('polite')
    await waitFor(() => expect(result.textContent).toMatch(/0\.6\.0 is available/))
    expect((screen.getByRole('button', { name: 'Check now' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  })
})

describe('the setup wizard', () => {
  it('offers the check unticked and stores "off" unless it is ticked', async () => {
    const { ttx, status } = fakeMain({ ...base, mode: 'ask' })
    show(<DoneStep />)
    const box = (await screen.findByRole('checkbox', {
      name: 'Check for new versions of Action Stations when the app starts',
    })) as HTMLInputElement
    expect(box.checked).toBe(false)
    await waitFor(() => expect(status().mode).toBe('off'))
    await userEvent.click(box)
    expect(ttx.calls('updates:set')).toContainEqual({ check: 'on' })
  })
})
