// Opt-in live check (#442): LIVE=1 pnpm exec vitest run src/main/updates/live.test.ts
// One real request to the GitHub releases API. Skipped in every normal run.
import { describe, expect, it } from 'vitest'
import { fetchLatestRelease } from './fetch-release'

describe.skipIf(process.env.LIVE !== '1')('the live GitHub releases API', () => {
  it('answers with a latest release the app can read', async () => {
    const r = await fetchLatestRelease({ appVersion: '0.0.0' })
    expect(r.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(r.url).toMatch(/^https:\/\/github\.com\/actionstations-ai\/actionstations\/releases\//)
  })
})
