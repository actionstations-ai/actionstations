import { describe, expect, it } from 'vitest'
import type { UpdateStatus } from '@shared/ipc'
import { bannerTitle, cooldownLeft, resultText } from './update-view'

const latest = {
  version: '0.6.0',
  name: 'Action Stations 0.6.0',
  publishedAt: '2026-11-02T15:00:00Z',
  url: 'https://github.com/actionstations-ai/actionstations/releases/tag/v0.6.0',
  notes: '',
  assets: [],
}
const base: UpdateStatus = {
  installed: '0.5.1',
  mode: 'on',
  askedCount: 0,
  checking: false,
  newer: false,
  ahead: false,
  dismissed: false,
  notes: [],
}

describe('update text', () => {
  it('names both versions in the banner', () => {
    const s = { ...base, newer: true, lastResult: { kind: 'ok' as const, latest } }
    expect(bannerTitle(s)).toBe('Action Stations 0.6.0 is available (you have 0.5.1)')
    expect(resultText(s)).toBe('Action Stations 0.6.0 is available (you have 0.5.1).')
  })

  it('says when there is nothing newer, or the app is ahead', () => {
    const ok = { kind: 'ok' as const, latest }
    expect(resultText({ ...base, lastResult: ok })).toBe('You have the latest release.')
    expect(resultText({ ...base, ahead: true, lastResult: ok })).toBe(
      'You are ahead of the latest release (0.6.0).',
    )
  })

  it('reports no check, a running check and a failure', () => {
    expect(resultText(base)).toBe('Not checked yet.')
    expect(resultText({ ...base, checking: true })).toMatch(/^Checking/)
    expect(
      resultText({ ...base, lastResult: { kind: 'error', message: 'GitHub answered HTTP 500' } }),
    ).toBe('The last check failed: GitHub answered HTTP 500.')
  })

  it('tells a rate-limited user when to try again', () => {
    const text = resultText({
      ...base,
      lastResult: {
        kind: 'error',
        message: 'GitHub allows 60 checks an hour from one network, and that limit was reached',
        retryAfter: '2026-11-02T16:05:00Z',
      },
    })
    expect(text).toMatch(/60 checks an hour.*\. Try again after .+\.$/)
  })

  it('holds Check now for a minute after a check', () => {
    const at = '2026-11-02T12:00:00.000Z'
    const t = Date.parse(at)
    expect(cooldownLeft(undefined, t)).toBe(0)
    expect(cooldownLeft(at, t + 10_000)).toBe(50_000)
    expect(cooldownLeft(at, t + 61_000)).toBe(0)
  })
})
