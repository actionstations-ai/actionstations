// Packs screen (#268, ADR-0018; store layout #1152): Discover and Your packs tabs, a page per
// pack, and the review every install goes through (catalog, URL, file picker, drag and drop, or
// an .aspack opened from the OS). Tab, open pack and filters live in the URL.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { Tabs } from 'radix-ui'
import type { PackUpdateView } from '@shared/ipc'
import { Button, PageHeader, ProgressBar } from '../../components/ui'
import { CancelJobButton } from '../../components/CancelJobButton'
import { call, subscribe } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { errorText } from '../../lib/errors'
import { STORE_KINDS, type StoreKind } from '@shared/packs/store'
import { toast } from '../../components/toast-store'
import { DiscoverTab } from './DiscoverTab'
import { PackPage } from './PackPage'
import { YourPacksTab } from './YourPacksTab'
import { buildStore, type StoreFilter } from './store-model'
import { InstallFromUrlDialog } from './InstallFromUrlDialog'
import { PackReviewView } from './PackReview'
import { reviewFile, usePackReview } from './review-store'
import { usePackDownload } from './use-pack-download'
import type { BrowseEntry } from './pack-format'
import { PACK_EXPORT_PATH } from '../pack-export'
import '../scenarios/scenarios.css'
import './packs.css'

type Tab = 'discover' | 'yours'

/** `?tab=` values, including the older ones (installed, browse). */
function tabOf(value: string | null): Tab {
  return value === 'yours' || value === 'installed' ? 'yours' : 'discover'
}

/** Refetch installed packs when main reports a change (install, enable, uninstall…). */
function usePacksChanged() {
  useEffect(
    () =>
      subscribe('packs:changed', () => {
        for (const c of ['packs:list', 'packs:updates'])
          void queryClient.invalidateQueries({ queryKey: [c] })
      }),
    [],
  )
}

async function pickFile() {
  try {
    const [file] = await call('dialog:open-files', {
      title: 'Install a pack',
      filters: [{ name: 'Action Stations pack', extensions: ['aspack'] }],
      multi: false,
    })
    if (file) reviewFile(file)
  } catch (err) {
    toast.error('Could not open the file', err)
  }
}

function DownloadStatus({
  download,
  job,
}: Pick<ReturnType<typeof usePackDownload>, 'download' | 'job'>) {
  if (!download || !job) return null
  return (
    <section className="card stack" aria-label="Pack download">
      <p role="status">
        Downloading {download.label}: {job.message}
      </p>
      <ProgressBar value={job.progress} label={`Downloading ${download.label}`} />
      <div className="row">
        <CancelJobButton jobId={download.jobId} />
      </div>
    </section>
  )
}

function useStoreParams() {
  const [params, setParams] = useSearchParams()
  const tab = tabOf(params.get('tab'))
  const packId = params.get('pack')
  const kind = params.get('kind') ?? ''
  const filter: StoreFilter = {
    query: params.get('q') ?? '',
    category: params.get('category') ?? '',
    kind: (STORE_KINDS as readonly string[]).includes(kind) ? (kind as StoreKind) : '',
  }
  const write = (next: { tab: Tab; pack?: string | null; filter?: StoreFilter }, push = false) => {
    const f = next.filter ?? filter
    const out: Record<string, string> = {}
    if (next.tab === 'yours') out.tab = 'yours'
    if (next.pack) out.pack = next.pack
    if (f.query) out.q = f.query
    if (f.category) out.category = f.category
    if (f.kind) out.kind = f.kind
    setParams(out, { replace: !push })
  }
  return {
    tab,
    packId,
    filter,
    setTab: (t: Tab) => write({ tab: t, pack: null }),
    setFilter: (f: StoreFilter) => write({ tab, pack: null, filter: f }),
    openPack: (id: string) => write({ tab, pack: id }, true),
    closePack: () => write({ tab, pack: null }),
  }
}

function useStorePacks() {
  const list = useIpcQuery('packs:list', undefined)
  const updates = useIpcQuery('packs:updates', undefined)
  const catalogs = useIpcQuery('packs:catalogs', undefined)
  const cached = useIpcQuery('packs:catalogEntries', undefined)
  const packs = useMemo(
    () => buildStore(list.data ?? [], cached.data ?? [], updates.data),
    [list.data, cached.data, updates.data],
  )
  return {
    packs,
    loading: list.isPending || catalogs.isPending,
    error: list.error ?? catalogs.error,
    hasCatalogs: (catalogs.data?.length ?? 0) > 0,
  }
}

export default function PacksPage() {
  const store = useStoreParams()
  const { packs, loading, error, hasCatalogs } = useStorePacks()
  const request = usePackReview((s) => s.request)
  const closeReview = usePackReview((s) => s.closeReview)
  const { download, job, start } = usePackDownload()
  const [urlOpen, setUrlOpen] = useState(false)
  const navigate = useNavigate()
  usePacksChanged()

  const reviewEntry = ({ entry, catalogUrl }: BrowseEntry) =>
    void start(
      { source: 'catalog', catalogUrl, id: entry.id, version: entry.version },
      `${entry.name} ${entry.version}`,
    )
  const reviewUpdate = (u: PackUpdateView, name: string) =>
    void start(
      { source: 'catalog', catalogUrl: u.catalogUrl, id: u.id, version: u.latest.version },
      `${name} ${u.latest.version}`,
    )
  const open = store.packId ? packs.find((p) => p.id === store.packId) : undefined

  const body = () => {
    if (request)
      return (
        <PackReviewView
          key={JSON.stringify(request)}
          request={request}
          onBack={closeReview}
          onDone={(id) => {
            closeReview()
            store.openPack(id)
          }}
        />
      )
    if (loading) return <p className="muted">Loading packs…</p>
    if (error)
      return (
        <p className="field__error" role="alert">
          {errorText(error)}
        </p>
      )
    if (open)
      return (
        <PackPage
          pack={open}
          packs={packs}
          onOpen={store.openPack}
          onBack={store.closePack}
          onGet={reviewEntry}
          onUpdate={reviewUpdate}
          busy={!!download}
        />
      )
    return (
      <Tabs.Root value={store.tab} onValueChange={(v) => store.setTab(v as Tab)} className="tabs">
        <Tabs.List className="tabs__list" aria-label="Packs">
          <Tabs.Trigger value="discover" className="tabs__trigger">
            Discover
          </Tabs.Trigger>
          <Tabs.Trigger value="yours" className="tabs__trigger">
            Your packs
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="discover" className="tabs__panel">
          <DiscoverTab
            packs={packs}
            hasCatalogs={hasCatalogs}
            filter={store.filter}
            onFilter={store.setFilter}
            onOpen={store.openPack}
          />
        </Tabs.Content>
        <Tabs.Content value="yours" className="tabs__panel">
          <YourPacksTab
            packs={packs}
            onOpen={store.openPack}
            onUpdate={reviewUpdate}
            onDiscover={() => store.setTab('discover')}
            onInstallFile={() => void pickFile()}
            updating={!!download}
          />
        </Tabs.Content>
      </Tabs.Root>
    )
  }

  return (
    <div className="page packs-page">
      <PageHeader
        title="Packs"
        description="Fields, toolkits, reference libraries and templates. Every pack you add is reviewed before it installs; drop an .aspack file anywhere on the window to review it."
        actions={
          <>
            <Button onClick={() => void pickFile()}>Install from file…</Button>
            <Button onClick={() => setUrlOpen(true)}>Install from URL…</Button>
            <Button onClick={() => navigate(PACK_EXPORT_PATH)}>Export as pack…</Button>
          </>
        }
      />
      <DownloadStatus download={download} job={job} />
      {body()}
      <InstallFromUrlDialog
        open={urlOpen}
        onOpenChange={setUrlOpen}
        onDownload={(url, sha256) => {
          setUrlOpen(false)
          void start({ source: 'url', url, ...(sha256 ? { sha256 } : {}) }, url)
        }}
      />
    </div>
  )
}
