// fetchLatestRelease with a fake fetch: never a real request.
import { describe, expect, it } from 'vitest'
import { fetchLatestRelease, LATEST_RELEASE_URL, UPDATE_MAX_BYTES } from './fetch-release'
import { fakeFetch, githubRelease, jsonResponse } from './test-release'

const get = (impl: typeof fetch, extra: Partial<Parameters<typeof fetchLatestRelease>[0]> = {}) =>
  fetchLatestRelease({ appVersion: '0.5.1', fetchImpl: impl, ...extra })

describe('fetchLatestRelease', () => {
  it('sends one plain GET to the releases API: no redirects, no cookies, a named User-Agent', async () => {
    const f = fakeFetch(() => jsonResponse(githubRelease()))
    const r = await get(f.impl)
    expect(r.version).toBe('0.6.0')
    expect(f.calls).toHaveLength(1)
    const { url, init } = f.calls[0]!
    expect(url).toBe(LATEST_RELEASE_URL)
    expect(url).toBe(
      'https://api.github.com/repos/actionstations-ai/actionstations/releases/latest',
    )
    expect(init).toMatchObject({ method: 'GET', redirect: 'error', credentials: 'omit' })
    expect(init.headers).toEqual({
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'ActionStations/0.5.1',
    })
  })

  it('refuses a plain-http URL off this computer before sending anything', async () => {
    const f = fakeFetch(() => jsonResponse(githubRelease()))
    await expect(get(f.impl, { url: 'http://api.github.com/x' })).rejects.toThrow(/https/)
    expect(f.calls).toHaveLength(0)
  })

  it('turns a 403 with no requests left into a rate-limit error with the reset time', async () => {
    const reset = Date.parse('2026-11-02T16:05:00Z') / 1000
    const f = fakeFetch(
      () =>
        new Response('{}', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
        }),
    )
    await expect(get(f.impl)).rejects.toMatchObject({
      message: expect.stringMatching(/60 checks an hour/),
      details: { retryAfter: '2026-11-02T16:05:00.000Z' },
    })
  })

  it('reports other HTTP errors by status', async () => {
    const f = fakeFetch(() => new Response('oops', { status: 500 }))
    await expect(get(f.impl)).rejects.toThrow('GitHub answered HTTP 500')
  })

  it('stops reading after 1 MB', async () => {
    const big = new Uint8Array(UPDATE_MAX_BYTES + 10).fill(32)
    const f = fakeFetch(() => new Response(big, { status: 200 }))
    await expect(get(f.impl)).rejects.toThrow(/larger than the 1 MB limit/)
  })

  it('gives up when GitHub stays silent', async () => {
    const silent = (async (_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      )) as typeof fetch
    await expect(get(silent, { timeoutMs: 20 })).rejects.toThrow('GitHub did not answer in time')
  })

  it('says the network is unreachable when the request fails', async () => {
    const offline = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch
    await expect(get(offline)).rejects.toThrow(/Could not reach GitHub/)
  })

  it('refuses an answer that is not JSON', async () => {
    const f = fakeFetch(() => new Response('<html>rate limited</html>', { status: 200 }))
    await expect(get(f.impl)).rejects.toThrow(/could not read/)
  })
})
