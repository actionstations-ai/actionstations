// Browse the catalogs the user added (#268). Opening this tab refreshes each catalog once (the
// one moment besides Refresh that the app fetches an index, ADR-0018); with no catalogs it
// shows the catalog editor from Settings instead of a fetch.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { CatalogRefreshResult } from '@shared/ipc'
import { PACK_KINDS, type PackKind } from '@shared/schemas/pack'
import { Badge, Button, EmptyState, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { queryClient, useIpcQuery } from '../../lib/query'
import { call } from '../../lib/api'
import { PackCatalogsSection } from '../settings/PackCatalogsSection'
import {
  KIND_LABEL,
  NO_FILTER,
  entryState,
  facets,
  filterEntries,
  formatBytes,
  latestEntries,
  type BrowseEntry,
  type BrowseFilter,
} from './pack-format'

function useCatalogRefresh(hasCatalogs: boolean) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<CatalogRefreshResult[]>([])
  const refresh = async () => {
    setBusy(true)
    try {
      const results = await call('packs:catalogRefresh', {})
      setFailed(results.filter((r) => !r.ok))
    } catch (err) {
      toast.error('Could not refresh the catalogs', err)
    } finally {
      setBusy(false)
      for (const c of ['packs:catalogEntries', 'packs:catalogs', 'packs:updates', 'settings:get'])
        void queryClient.invalidateQueries({ queryKey: [c] })
    }
  }
  // Once per visit to Browse, and only when there is something to fetch.
  const done = useRef(false)
  useEffect(() => {
    if (!hasCatalogs || done.current) return
    done.current = true
    void refresh()
  }, [hasCatalogs])
  return { busy, failed, refresh }
}

function Filters(props: {
  value: BrowseFilter
  onChange: (f: BrowseFilter) => void
  domains: string[]
  tags: string[]
}) {
  const f = props.value
  const set = (patch: Partial<BrowseFilter>) => props.onChange({ ...f, ...patch })
  return (
    <div className="pack-filters" role="search" aria-label="Filter packs">
      <Field label="Search">
        {({ id }) => (
          <input
            id={id}
            className="input"
            type="search"
            value={f.query}
            placeholder="Name, author, tag…"
            onChange={(e) => set({ query: e.target.value })}
          />
        )}
      </Field>
      <Field label="Kind">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={f.kind}
            onChange={(e) => set({ kind: e.target.value as PackKind | '' })}
          >
            <option value="">Any kind</option>
            {PACK_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k].many}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Domain">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={f.domain}
            onChange={(e) => set({ domain: e.target.value })}
          >
            <option value="">Any domain</option>
            {props.domains.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Tag">
        {({ id }) => (
          <select
            id={id}
            className="select"
            value={f.tag}
            onChange={(e) => set({ tag: e.target.value })}
          >
            <option value="">Any tag</option>
            {props.tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </Field>
    </div>
  )
}

function EntryCard(props: {
  item: BrowseEntry
  state: ReturnType<typeof entryState>
  onReview: (item: BrowseEntry) => void
  busy: boolean
}) {
  const { entry: e, catalogName } = props.item
  const s = props.state
  const label =
    s.kind === 'update'
      ? `Review update to ${e.version}`
      : s.kind === 'installed'
        ? 'Review and reinstall'
        : s.kind === 'newer-installed'
          ? `Review ${e.version} (older)`
          : 'Review and install'
  return (
    <li className="card stack pack-card">
      <h2 className="pack-card__name">
        {e.name} <span className="muted">{e.version}</span>
      </h2>
      <p>{e.summary}</p>
      <p className="pack-row__meta">
        <span>By {e.author.name}</span>
        <span>{e.license}</span>
        <span>{formatBytes(e.size)}</span>
        <span>From {catalogName}</span>
      </p>
      <div className="row pack-row__badges">
        {e.kinds.map((k) => (
          <Badge key={k}>{KIND_LABEL[k].many}</Badge>
        ))}
        {s.kind === 'installed' && <Badge tone="ok">Installed</Badge>}
        {s.kind === 'update' && <Badge tone="info">Update available (have {s.installed})</Badge>}
        {s.kind === 'newer-installed' && <Badge>Newer {s.installed} installed</Badge>}
      </div>
      <div className="row">
        <Button
          size="sm"
          variant={s.kind === 'installed' ? 'default' : 'primary'}
          disabled={props.busy}
          onClick={() => props.onReview(props.item)}
        >
          {label}
          <span className="sr-only"> {e.name}</span>
        </Button>
      </div>
    </li>
  )
}

export function BrowseTab(props: { onReview: (item: BrowseEntry) => void; busy: boolean }) {
  const settings = useIpcQuery('settings:get', undefined)
  const catalogs = useIpcQuery('packs:catalogs', undefined)
  const cached = useIpcQuery('packs:catalogEntries', undefined)
  const installed = useIpcQuery('packs:list', undefined)
  const hasCatalogs = (catalogs.data?.length ?? 0) > 0
  const { busy, failed, refresh } = useCatalogRefresh(hasCatalogs)
  const [filter, setFilter] = useState<BrowseFilter>(NO_FILTER)
  const all = useMemo(() => latestEntries(cached.data ?? []), [cached.data])
  const shown = useMemo(() => filterEntries(all, filter), [all, filter])
  const { domains, tags } = useMemo(() => facets(all), [all])

  if (catalogs.isPending || settings.isPending) return <p className="muted">Loading catalogs…</p>
  if (catalogs.error)
    return (
      <p className="field__error" role="alert">
        {errorText(catalogs.error)}
      </p>
    )
  if (!hasCatalogs)
    return (
      <div className="stack">
        <EmptyState
          title="Add a catalog to browse packs"
          body="A catalog lists packs you can install. None is added by default, and the app fetches one only when you open Browse or press Refresh."
        />
        {settings.data && <PackCatalogsSection settings={settings.data} />}
      </div>
    )

  return (
    <div className="stack">
      <div className="row pack-toolbar">
        <p className="muted" role="status">
          {busy ? 'Refreshing catalogs…' : `${shown.length} of ${all.length} packs`}
        </p>
        <div className="row">
          <Link className="btn btn--sm btn--ghost" to="/settings">
            Manage catalogs
          </Link>
          <Button size="sm" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
      </div>
      {failed.length > 0 && (
        <ul className="pack-callout pack-callout--warn" aria-label="Catalogs that failed">
          {failed.map((f) => (
            <li key={f.url}>
              <span className="mono pack-break">{f.url}</span>: {f.error ?? 'refresh failed'}
            </li>
          ))}
        </ul>
      )}
      <Filters value={filter} onChange={setFilter} domains={domains} tags={tags} />
      {all.length === 0 ? (
        <EmptyState
          title={busy ? 'Fetching catalogs…' : 'No packs in your catalogs'}
          body="The catalogs you added list no packs yet, or have not been fetched. Press Refresh to try again."
        />
      ) : shown.length === 0 ? (
        <EmptyState
          title="No packs match"
          actions={<Button onClick={() => setFilter(NO_FILTER)}>Clear filters</Button>}
        />
      ) : (
        <ul className="pack-grid" aria-label={`${shown.length} packs`}>
          {shown.map((item) => (
            <EntryCard
              key={`${item.catalogUrl}\n${item.entry.id}`}
              item={item}
              state={entryState(item.entry, installed.data ?? [])}
              onReview={props.onReview}
              busy={props.busy}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
