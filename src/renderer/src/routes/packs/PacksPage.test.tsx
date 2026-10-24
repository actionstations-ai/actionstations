// @vitest-environment happy-dom
// Packs screen (#268): empty states, the review before install, conflicts and updates.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import type { CachedCatalogView, InstalledPackView, PackReview, PackUpdateView } from '@shared/ipc'
import type { PackCatalogEntry } from '@shared/schemas/pack'
import { AppSettings } from '@shared/schemas/settings'
import PacksPage from './PacksPage'
import { reviewFile, usePackReview } from './review-store'
import { mockTtx, renderAt, type Handlers } from '../documents/test-utils'

const RAIL = 'ai.actionstations.freight-rail'
const SHA = 'a'.repeat(64)
const CATALOG = 'https://actionstations.ai/packs/index.json'

const installed = (over: Partial<InstalledPackView> = {}): InstalledPackView => ({
  id: RAIL,
  version: '1.0.0',
  name: 'Freight Rail Operations',
  summary: 'Rail yard injects and a freight rail domain profile.',
  description: '',
  author: { name: 'Action Stations' },
  license: 'CC-BY-4.0',
  domains: ['freight_rail'],
  tags: ['rail'],
  enabled: true,
  installedAt: '2026-10-20T12:00:00.000Z',
  source: { kind: 'catalog', url: CATALOG },
  archiveSha256: SHA,
  contentSha256: 'b'.repeat(64),
  items: [
    {
      kind: 'templates',
      id: 'yard_board',
      title: 'Yard board',
      replacesBuiltin: false,
      license: 'CC-BY-4.0',
      size: 10,
    },
  ],
  conflicts: [],
  ...over,
})

const entry = (over: Partial<PackCatalogEntry> = {}): PackCatalogEntry => ({
  id: RAIL,
  name: 'Freight Rail Operations',
  version: '1.2.0',
  formatVersion: 1,
  summary: 'Rail yard injects and a freight rail domain profile.',
  author: { name: 'Action Stations' },
  license: 'CC-BY-4.0',
  kinds: ['templates', 'domains'],
  domains: ['freight_rail'],
  tags: ['rail'],
  minAppVersion: '0.3.0',
  size: 20480,
  sha256: SHA,
  url: 'https://actionstations.ai/packs/rail-1.2.0.aspack',
  updated: '2026-10-20T12:00:00.000Z',
  ...over,
})

const review = (over: Partial<PackReview> = {}): PackReview => ({
  id: RAIL,
  name: 'Freight Rail Operations',
  version: '1.0.0',
  summary: 'Rail yard injects.',
  description: '# Rail\n\nYard work. <script>alert(1)</script> ![map](https://x.test/m.png)',
  author: { name: 'Action Stations', url: 'https://actionstations.ai' },
  license: 'CC-BY-4.0',
  minAppVersion: '0.3.0',
  domains: ['freight_rail'],
  tags: ['rail'],
  size: 4096,
  archiveSha256: SHA,
  contentSha256: 'b'.repeat(64),
  source: { kind: 'file', name: 'rail.aspack' },
  items: [
    {
      kind: 'prompts',
      id: 'inject_text',
      title: 'Inject text',
      replacesBuiltin: true,
      license: 'CC-BY-4.0',
      size: 10,
    },
    {
      kind: 'workflows',
      id: 'upscale',
      title: 'Upscale',
      replacesBuiltin: false,
      license: 'CC-BY-4.0',
      customNodes: ['UltimateSDUpscale'],
      size: 10,
    },
  ],
  documents: [
    {
      path: 'documents/rules/rules.md',
      title: 'Yard safety rules',
      source: 'FRA, fra.dot.gov',
      license: 'CC0-1.0',
    },
  ],
  customNodes: ['UltimateSDUpscale'],
  conflicts: [],
  action: 'install',
  willEnable: true,
  ...over,
})

const base: Handlers = {
  'settings:get': () => AppSettings.parse({}),
  'packs:list': () => [],
  'packs:updates': () => [],
  'packs:catalogs': () => [],
  'packs:catalogEntries': () => [],
  'jobs:list': () => [],
}

afterEach(() => {
  cleanup()
  usePackReview.setState({ request: null, download: null })
})

describe('PacksPage empty states', () => {
  it('suggests browsing or a file when nothing is installed', async () => {
    mockTtx(base)
    renderAt('/packs', '/packs', PacksPage)
    const empty = await screen.findByRole('region', { name: 'No packs installed' })
    expect(within(empty).getByRole('button', { name: 'Browse catalogs' })).toBeTruthy()
    expect(within(empty).getByRole('button', { name: 'Install from file…' })).toBeTruthy()
  })

  it('offers the official catalog on Browse with no catalogs, and fetches nothing', async () => {
    const ttx = mockTtx(base)
    renderAt('/packs?tab=browse', '/packs', PacksPage)
    expect(
      await screen.findByRole('region', { name: 'Add a catalog to browse packs' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Add the official catalog (actionstations.ai)' }),
    ).toBeTruthy()
    expect(screen.getByLabelText('Catalog URL')).toBeTruthy()
    expect(ttx.calls('packs:catalogRefresh')).toEqual([])
  })
})

describe('PacksPage browse', () => {
  it('refreshes once on open, lists entries with install state and filters by kind', async () => {
    const catalogs: CachedCatalogView[] = [
      {
        url: CATALOG,
        name: 'Action Stations',
        fetchedAt: '2026-10-24T00:00:00Z',
        skipped: 0,
        entries: [
          entry({ version: '1.1.0' }),
          entry(),
          entry({
            id: 'org.example.transit',
            name: 'Transit',
            kinds: ['prompts'],
            domains: [],
            tags: ['bus'],
          }),
        ],
      },
    ]
    const ttx = mockTtx({
      ...base,
      'packs:catalogs': () => [{ url: CATALOG, addedAt: '2026-10-24T00:00:00Z' }],
      'packs:catalogEntries': () => catalogs,
      'packs:catalogRefresh': () => [{ url: CATALOG, ok: true, entries: 3, skipped: 0 }],
      'packs:list': () => [installed()],
    })
    renderAt('/packs?tab=browse', '/packs', PacksPage)
    const grid = await screen.findByRole('list', { name: '2 packs' })
    await waitFor(() => expect(ttx.calls('packs:catalogRefresh')).toEqual([{}]))
    const rail = within(grid)
      .getByRole('heading', { name: /Freight Rail Operations/ })
      .closest('li')!
    expect(within(rail).getByText('Update available (have 1.0.0)')).toBeTruthy()
    expect(within(rail).getByText('20 KB')).toBeTruthy()
    const user = userEvent.setup()
    await user.selectOptions(screen.getByLabelText('Kind'), 'prompts')
    const filtered = await screen.findByRole('list', { name: '1 packs' })
    expect(within(filtered).getByRole('heading', { name: /Transit/ })).toBeTruthy()
  })
})

describe('PacksPage review', () => {
  it('shows everything about the archive and installs only on the button', async () => {
    const ttx = mockTtx({
      ...base,
      'packs:inspect': () => ({ ok: true, review: review() }),
      'packs:install': () => ({ pack: installed(), action: 'install' }),
    })
    reviewFile('/Users/a/Downloads/rail.aspack')
    renderAt('/packs', '/packs', PacksPage)
    const region = await screen.findByRole('region', { name: /^Freight Rail Operations/ })
    expect(ttx.calls('packs:inspect')).toEqual([{ filePath: '/Users/a/Downloads/rail.aspack' }])
    expect(within(region).getByText(SHA)).toBeTruthy()
    expect(within(region).getByText(/compare this sha256 with the publisher/)).toBeTruthy()
    expect(within(region).getByText('File: rail.aspack')).toBeTruthy()
    expect(within(region).getByText('0.3.0 or later')).toBeTruthy()
    expect(within(region).getByText('Replaces built-in prompt')).toBeTruthy()
    expect(within(region).getByRole('heading', { name: 'Needs custom ComfyUI nodes' })).toBeTruthy()
    const docs = within(region).getByRole('table')
    expect(within(docs).getByRole('rowheader', { name: 'Yard safety rules' })).toBeTruthy()
    expect(within(docs).getByText('CC0-1.0')).toBeTruthy()
    // Text-only description: raw HTML is text, images are their alt text, no network.
    const about = within(region).getByRole('region', { name: 'About Freight Rail Operations' })
    expect(about.querySelector('script, img')).toBeNull()
    expect(about.textContent).toContain('<script>alert(1)</script>')
    expect(ttx.calls('packs:install')).toEqual([])

    await userEvent.setup().click(within(region).getByRole('button', { name: 'Install' }))
    await waitFor(() =>
      expect(ttx.calls('packs:install')).toEqual([
        { path: '/Users/a/Downloads/rail.aspack', source: { kind: 'file', name: 'rail.aspack' } },
      ]),
    )
    await waitFor(() => expect(usePackReview.getState().request).toBeNull())
  })

  it('lists the reader problems for an archive that cannot be installed', async () => {
    mockTtx({
      ...base,
      'packs:inspect': () => ({
        ok: false,
        problems: [{ path: 'prompts/x.md', message: 'sha256 does not match pack.json' }],
      }),
    })
    reviewFile('/tmp/bad.aspack')
    renderAt('/packs', '/packs', PacksPage)
    expect(await screen.findByText('This pack cannot be installed')).toBeTruthy()
    expect(screen.getByText(/sha256 does not match/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Install' })).toBeNull()
  })

  it('requires confirming a downgrade', async () => {
    const ttx = mockTtx({
      ...base,
      'packs:inspect': () => ({
        ok: true,
        review: review({ action: 'downgrade', installed: { version: '1.1.0', enabled: true } }),
      }),
      'packs:install': () => ({ pack: installed(), action: 'downgrade' }),
    })
    reviewFile('/tmp/old.aspack')
    renderAt('/packs', '/packs', PacksPage)
    const button = await screen.findByRole('button', { name: 'Downgrade to 1.0.0' })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    const user = userEvent.setup()
    await user.click(screen.getByRole('checkbox', { name: /Replace the installed 1.1.0/ }))
    await user.click(button)
    await waitFor(() =>
      expect(ttx.calls('packs:install')).toEqual([
        expect.objectContaining({ path: '/tmp/old.aspack', confirmDowngrade: true }),
      ]),
    )
  })
})

describe('PacksPage conflicts', () => {
  it('names the conflict on the installed list and in the review', async () => {
    const sentence =
      'Disable Freight Rail Operations (ai.actionstations.freight-rail) to enable this pack.'
    mockTtx({
      ...base,
      'packs:list': () => [
        installed(),
        installed({
          id: 'org.example.rail-twin',
          name: 'Rail Twin',
          enabled: false,
          conflict: sentence,
          conflicts: [{ kind: 'templates', id: 'yard_board', packId: RAIL, packName: 'Freight' }],
        }),
      ],
    })
    renderAt('/packs', '/packs', PacksPage)
    const list = await screen.findByRole('list', { name: 'Installed packs' })
    const twin = within(list).getByRole('listitem', { name: /Rail Twin/ })
    expect(within(twin).getByText('Conflict')).toBeTruthy()
    expect(within(twin).getByText(sentence)).toBeTruthy()
    cleanup()

    mockTtx({
      ...base,
      'packs:inspect': () => ({
        ok: true,
        review: review({
          willEnable: false,
          conflict: sentence,
          conflicts: [{ kind: 'templates', id: 'yard_board', packId: RAIL, packName: 'Freight' }],
        }),
      }),
    })
    reviewFile('/tmp/twin.aspack')
    renderAt('/packs', '/packs', PacksPage)
    const conflicts = await screen.findByRole('region', { name: 'Conflicts' })
    expect(within(conflicts).getByText(sentence)).toBeTruthy()
    expect(within(conflicts).getByText(/installs disabled/)).toBeTruthy()
  })

  it('shows a refused enable as an error', async () => {
    const ttx = mockTtx({
      ...base,
      'packs:list': () => [installed({ enabled: false })],
      'packs:setEnabled': () => {
        throw new Error('Disable Rail Twin to enable this pack.')
      },
    })
    renderAt('/packs', '/packs', PacksPage)
    const toggle = await screen.findByRole('switch', { name: 'Enabled' })
    await userEvent.setup().click(toggle)
    await waitFor(() =>
      expect(ttx.calls('packs:setEnabled')).toEqual([{ id: RAIL, enabled: true }]),
    )
  })
})

describe('PacksPage updates', () => {
  it('downloads the update, then reviews it with the catalog as source', async () => {
    const update: PackUpdateView = {
      id: RAIL,
      installed: '1.0.0',
      latest: entry(),
      catalogUrl: CATALOG,
    }
    const ttx = mockTtx({
      ...base,
      'packs:list': () => [installed()],
      'packs:updates': () => [update],
      'packs:download': () => ({ jobId: 'job1' }),
      'jobs:get': () => {
        throw new Error('unknown')
      },
      'packs:inspect': () => ({
        ok: true,
        review: review({
          version: '1.2.0',
          action: 'update',
          source: { kind: 'catalog', url: CATALOG },
          installed: { version: '1.0.0', enabled: true },
        }),
      }),
      'packs:install': () => ({ pack: installed({ version: '1.2.0' }), action: 'update' }),
    })
    renderAt('/packs', '/packs', PacksPage)
    const row = await screen.findByRole('listitem', { name: /Freight Rail Operations/ })
    expect(within(row).getByText('Update available: 1.2.0')).toBeTruthy()
    const user = userEvent.setup()
    await user.click(within(row).getByRole('button', { name: 'Review update to 1.2.0' }))
    await waitFor(() =>
      expect(ttx.calls('packs:download')).toEqual([
        { source: 'catalog', catalogUrl: CATALOG, id: RAIL, version: '1.2.0' },
      ]),
    )
    expect(ttx.calls('packs:install')).toEqual([])
    act(() =>
      ttx.emit('job:done', {
        jobId: 'job1',
        kind: 'pack-download',
        status: 'done',
        result: { path: '/staging/rail.aspack', sha256: SHA, size: 20480, url: entry().url },
      }),
    )
    const button = await screen.findByRole('button', { name: 'Update to 1.2.0' })
    expect(ttx.calls('packs:inspect')).toEqual([
      { downloadedPath: '/staging/rail.aspack', source: { kind: 'catalog', url: CATALOG } },
    ])
    expect(screen.getByText('Matches the sha256 the catalog lists.')).toBeTruthy()
    await user.click(button)
    await waitFor(() =>
      expect(ttx.calls('packs:install')).toEqual([
        { path: '/staging/rail.aspack', source: { kind: 'catalog', url: CATALOG } },
      ]),
    )
  })

  it('shows an unknown source and archive hash in plain words', async () => {
    mockTtx({
      ...base,
      'packs:list': () => [installed({ source: { kind: 'unknown' }, archiveSha256: 'unknown' })],
    })
    renderAt('/packs', '/packs', PacksPage)
    const row = await screen.findByRole('listitem', { name: /Freight Rail Operations/ })
    expect(within(row).getByText(/^Not recorded \(the pack list was rebuilt/)).toBeTruthy()
    await userEvent.setup().click(within(row).getByRole('button', { name: /Details/ }))
    expect(within(row).getByText(/^Not recorded \(the original archive/)).toBeTruthy()
    expect(within(row).queryByText('unknown')).toBeNull()
  })
})
