// Test helpers for the update check (#442): a GitHub "latest release" answer and fake fetches.
// Imported only from tests; no test ever calls GitHub.

export function githubRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const tag = (overrides.tag_name as string | undefined) ?? 'v0.6.0'
  const v = tag.replace(/^v/, '')
  return {
    url: `https://api.github.com/repos/actionstations-ai/actionstations/releases/1`,
    tag_name: tag,
    name: `Action Stations ${v}`,
    html_url: `https://github.com/actionstations-ai/actionstations/releases/tag/${tag}`,
    published_at: '2026-11-02T15:00:00Z',
    body: '## Highlights\n\n- Tip of the day\n- Update check',
    draft: false,
    prerelease: false,
    author: { login: 'someone' },
    assets: [
      { name: `actionstations-${v}-mac-arm64.dmg`, size: 263_000_000 },
      { name: `actionstations-${v}-mac-arm64.dmg.sha256`, size: 100 },
      { name: `actionstations-${v}-win-x64-setup.exe`, size: 290_000_000 },
      { name: `actionstations-${v}-win-x64-setup.exe.sha256`, size: 100 },
      { name: `actionstations-${v}-linux-x86_64.AppImage`, size: 327_000_000 },
    ],
    ...overrides,
  }
}

export interface FakeCall {
  url: string
  init: RequestInit
}

/** A fetch that answers every request with `respond()` and records what was asked. */
export function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: FakeCall[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return respond()
  }) as typeof fetch
  return { impl, calls }
}

export const jsonResponse = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
