// The hazard HTTP layer: allow-list, https only, redirects, size cap, identification. Fake fetch.
import { describe, expect, it, vi } from 'vitest'
import { HazardHttpError, assertHazardUrl, hazardGet, userAgent } from './http'

const ok = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init })

function fake(...answers: Response[]) {
  const calls: { url: string; init: RequestInit }[] = []
  let i = 0
  const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return answers[Math.min(i++, answers.length - 1)]!
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('allowed addresses', () => {
  it.each([
    'https://api.weather.gov/alerts/active?point=1,2',
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson',
    'https://firms.modaps.eosdis.nasa.gov/api/area/csv/k/VIIRS_SNPP_NRT/1,2,3,4/1',
    'https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries',
  ])('accepts %s', (url) => {
    expect(assertHazardUrl(url).protocol).toBe('https:')
  })
  it.each([
    'http://api.weather.gov/alerts',
    'https://example.com/alerts',
    'https://api.weather.gov.evil.example/alerts',
    'https://user:pw@api.weather.gov/alerts',
    'http://127.0.0.1:9999/alerts',
    'not a url',
  ])('refuses %s', (url) => {
    expect(() => assertHazardUrl(url)).toThrow()
  })
})

describe('hazardGet', () => {
  it('names the app and website and nothing else about the user', async () => {
    const f = fake(ok('{}'))
    await hazardGet('https://api.weather.gov/alerts/active?point=1,2', {
      version: '0.9.0',
      fetchImpl: f.impl,
    })
    const headers = f.calls[0]!.init.headers as Record<string, string>
    expect(headers['user-agent']).toBe('ActionStations/0.9.0 (+https://actionstations.ai)')
    expect(userAgent('1.0.0')).not.toMatch(/@/)
    expect(f.calls[0]!.init.credentials).toBe('omit')
    expect(f.calls[0]!.init.redirect).toBe('manual')
  })

  it('follows a redirect inside the same host', async () => {
    const f = fake(
      new Response(null, { status: 302, headers: { location: '/alerts/v2' } }),
      ok('{"ok":true}'),
    )
    const res = await hazardGet('https://api.weather.gov/alerts', {
      version: '1',
      fetchImpl: f.impl,
    })
    expect(res.text).toBe('{"ok":true}')
    expect(f.calls[1]!.url).toBe('https://api.weather.gov/alerts/v2')
  })

  it('refuses a redirect to another host, even an allowed one', async () => {
    const f = fake(
      new Response(null, { status: 302, headers: { location: 'https://www.fema.gov/x' } }),
    )
    await expect(
      hazardGet('https://api.weather.gov/alerts', { version: '1', fetchImpl: f.impl }),
    ).rejects.toThrow(/Refused a redirect/)
    expect(f.calls).toHaveLength(1)
  })

  it('refuses a redirect to http or to a local address', async () => {
    const f = fake(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/x' } }))
    await expect(
      hazardGet('https://api.weather.gov/alerts', { version: '1', fetchImpl: f.impl }),
    ).rejects.toThrow()
  })

  it('stops after 3 redirects', async () => {
    const hop = () => new Response(null, { status: 302, headers: { location: '/again' } })
    const f = fake(hop(), hop(), hop(), hop(), hop())
    await expect(
      hazardGet('https://api.weather.gov/alerts', { version: '1', fetchImpl: f.impl }),
    ).rejects.toThrow(/Too many redirects/)
  })

  it('reports the HTTP status of a failure, without the query string', async () => {
    const f = fake(new Response('slow down', { status: 429 }))
    const err = await hazardGet('https://api.weather.gov/alerts/active?point=1,2', {
      version: '1',
      fetchImpl: f.impl,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HazardHttpError)
    expect((err as HazardHttpError).httpStatus).toBe(429)
    expect((err as Error).message).not.toContain('point=')
  })

  it('refuses a body over the size cap, declared or received', async () => {
    const declared = fake(ok('x', { headers: { 'content-length': '999999' } }))
    await expect(
      hazardGet('https://api.weather.gov/a', {
        version: '1',
        fetchImpl: declared.impl,
        maxBytes: 1000,
      }),
    ).rejects.toThrow(/larger than/)
    const streamed = fake(ok('y'.repeat(5000)))
    await expect(
      hazardGet('https://api.weather.gov/a', {
        version: '1',
        fetchImpl: streamed.impl,
        maxBytes: 1000,
      }),
    ).rejects.toThrow(/larger than/)
  })

  it('maps hosts to a local server only when a test base is given', async () => {
    const f = fake(ok('{}'))
    await hazardGet('https://www.fema.gov/api/open/v2/X?$top=1', {
      version: '1',
      fetchImpl: f.impl,
      testBase: 'http://127.0.0.1:5555/',
    })
    expect(f.calls[0]!.url).toBe('http://127.0.0.1:5555/www.fema.gov/api/open/v2/X?$top=1')
  })

  it('cancels with the caller signal', async () => {
    const ctl = new AbortController()
    const impl = vi.fn(
      (_u: unknown, init?: RequestInit) =>
        new Promise<Response>((_res, rej) =>
          init?.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))),
        ),
    ) as unknown as typeof fetch
    const p = hazardGet('https://api.weather.gov/a', { version: '1', fetchImpl: impl }, ctl.signal)
    ctl.abort()
    await expect(p).rejects.toMatchObject({ code: 'CANCELLED' })
  })
})
