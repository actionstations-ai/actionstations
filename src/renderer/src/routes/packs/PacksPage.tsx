// Packs screen (#268, ADR-0018): Installed and Browse tabs, and the review every install goes
// through (catalog, URL, file picker, drag and drop, or an .aspack opened from the OS).
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Tabs } from 'radix-ui'
import type { PackUpdateView } from '@shared/ipc'
import { Button, PageHeader, ProgressBar } from '../../components/ui'
import { CancelJobButton } from '../../components/CancelJobButton'
import { call, subscribe } from '../../lib/api'
import { queryClient } from '../../lib/query'
import { toast } from '../../components/toast-store'
import { BrowseTab } from './BrowseTab'
import { InstalledTab } from './InstalledTab'
import { InstallFromUrlDialog } from './InstallFromUrlDialog'
import { PackReviewView } from './PackReview'
import { reviewFile, usePackReview } from './review-store'
import { usePackDownload } from './use-pack-download'
import type { BrowseEntry } from './pack-format'
import '../scenarios/scenarios.css'
import './packs.css'

type Tab = 'installed' | 'browse'

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

export default function PacksPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'browse' ? 'browse' : 'installed'
  const setTab = (t: Tab) => setParams(t === 'installed' ? {} : { tab: t }, { replace: true })
  const request = usePackReview((s) => s.request)
  const closeReview = usePackReview((s) => s.closeReview)
  const { download, job, start } = usePackDownload()
  const [urlOpen, setUrlOpen] = useState(false)
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

  return (
    <div className="page packs-page">
      <PageHeader
        title="Packs"
        description="Add templates, prompts, domain profiles, workflows, reference documents and example projects. Every pack is reviewed before it installs; drop an .aspack file anywhere on the window to review it."
        actions={
          <>
            <Button onClick={() => void pickFile()}>Install from file…</Button>
            <Button onClick={() => setUrlOpen(true)}>Install from URL…</Button>
          </>
        }
      />
      <DownloadStatus download={download} job={job} />
      {request ? (
        <PackReviewView
          key={JSON.stringify(request)}
          request={request}
          onBack={closeReview}
          onDone={() => {
            closeReview()
            setTab('installed')
          }}
        />
      ) : (
        <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)} className="tabs">
          <Tabs.List className="tabs__list" aria-label="Packs">
            <Tabs.Trigger value="installed" className="tabs__trigger">
              Installed
            </Tabs.Trigger>
            <Tabs.Trigger value="browse" className="tabs__trigger">
              Browse
            </Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="installed" className="tabs__panel">
            <InstalledTab
              onUpdate={reviewUpdate}
              onBrowse={() => setTab('browse')}
              onInstallFile={() => void pickFile()}
              updating={!!download}
            />
          </Tabs.Content>
          <Tabs.Content value="browse" className="tabs__panel">
            <BrowseTab onReview={reviewEntry} busy={!!download} />
          </Tabs.Content>
        </Tabs.Root>
      )}
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
