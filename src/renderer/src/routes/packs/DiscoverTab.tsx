// Discover (#1152): every pack, included and from the catalogs, as a store: search, categories
// and kinds, a featured row, then a shelf per category. Opening Discover refreshes each added
// catalog once (besides Refresh, the only moment the app fetches an index, ADR-0018); with no
// catalog it offers the official one and fetches nothing.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { OFFICIAL_CATALOG_URL, type CatalogRefreshResult } from '@shared/ipc'
import {
  ALL_CATEGORIES,
  STORE_FEATURED,
  STORE_KINDS,
  STORE_KIND_LABEL,
  type StoreKind,
} from '@shared/packs/store'
import { Button, EmptyState } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient, useIpcMutation } from '../../lib/query'
import {
  NO_STORE_FILTER,
  filterStore,
  isFiltered,
  shelves,
  type StoreFilter,
  type StorePack,
} from './store-model'
import { TileGrid } from './StoreTile'

const SHELF_SIZE = 6
const CATALOG_QUERIES: (
  'packs:catalogEntries' | 'packs:catalogs' | 'packs:updates' | 'settings:get'
)[] = ['packs:catalogEntries', 'packs:catalogs', 'packs:updates', 'settings:get']

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
      for (const c of CATALOG_QUERIES) void queryClient.invalidateQueries({ queryKey: [c] })
    }
  }
  // Once per visit to Discover, and only when there is something to fetch.
  const done = useRef(false)
  useEffect(() => {
    if (!hasCatalogs || done.current) return
    done.current = true
    void refresh()
  }, [hasCatalogs])
  return { busy, failed, refresh }
}

function CatalogOffer() {
  const add = useIpcMutation('packs:catalogAdd', { invalidates: CATALOG_QUERIES })
  return (
    <section className="pack-offer" aria-labelledby="pack-offer-title">
      <div className="stack">
        <h2 id="pack-offer-title">More packs from a catalog</h2>
        <p className="muted">
          Reference libraries for every field and community packs are listed in a catalog. None is
          added by default; the app fetches a catalog only when you open Discover or press Refresh.
        </p>
      </div>
      <div className="row">
        <Button
          variant="primary"
          disabled={add.isPending}
          onClick={() =>
            add.mutate(
              { url: OFFICIAL_CATALOG_URL },
              {
                onSuccess: () => toast.success('Catalog added'),
                onError: (err) => toast.error('Could not add the catalog', err),
              },
            )
          }
        >
          Add the official catalog (actionstations.ai)
        </Button>
        <Link className="btn btn--ghost" to="/settings">
          Other catalogs…
        </Link>
      </div>
    </section>
  )
}

function StoreFilters(props: {
  value: StoreFilter
  onChange: (f: StoreFilter) => void
  counts: Map<string, number>
}) {
  const f = props.value
  const set = (patch: Partial<StoreFilter>) => props.onChange({ ...f, ...patch })
  const chip = (active: boolean) => (active ? 'pack-chip pack-chip--on' : 'pack-chip')
  return (
    <div className="stack pack-filters" role="search" aria-label="Find packs">
      <label className="sr-only" htmlFor="pack-search">
        Search packs
      </label>
      <input
        id="pack-search"
        className="input pack-search"
        type="search"
        value={f.query}
        placeholder="Search packs: a field, a document, an author…"
        onChange={(e) => set({ query: e.target.value })}
      />
      <div className="pack-chips" role="group" aria-label="Category">
        <button
          type="button"
          className={chip(!f.category)}
          aria-pressed={!f.category}
          onClick={() => set({ category: '' })}
        >
          All
        </button>
        {ALL_CATEGORIES.filter((c) => props.counts.get(c.id)).map((c) => (
          <button
            key={c.id}
            type="button"
            className={chip(f.category === c.id)}
            aria-pressed={f.category === c.id}
            onClick={() => set({ category: f.category === c.id ? '' : c.id })}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="pack-chips" role="group" aria-label="Kind">
        {(['', ...STORE_KINDS.filter((k) => k !== 'core')] as (StoreKind | '')[]).map((k) => (
          <button
            key={k || 'all'}
            type="button"
            className={chip(f.kind === k)}
            aria-pressed={f.kind === k}
            onClick={() => set({ kind: k })}
          >
            {k ? STORE_KIND_LABEL[k].many : 'Every kind'}
          </button>
        ))}
      </div>
    </div>
  )
}

function Featured(props: { packs: readonly StorePack[]; onOpen: (id: string) => void }) {
  return (
    <>
      {STORE_FEATURED.map((f) => {
        const packs = f.packIds
          .map((id) => props.packs.find((p) => p.id === id))
          .filter((p): p is StorePack => !!p)
        if (!packs.length) return null
        return (
          <section key={f.title} className="pack-featured stack" aria-label={f.title}>
            <p className="pack-featured__eyebrow">Featured</p>
            <h2>{f.title}</h2>
            <p>{f.text}</p>
            <TileGrid packs={packs} label={f.title} onOpen={props.onOpen} />
          </section>
        )
      })}
    </>
  )
}

function Shelves(props: {
  packs: readonly StorePack[]
  onOpen: (id: string) => void
  onSeeAll: (category: string) => void
}) {
  return (
    <>
      {shelves(props.packs).map(({ category, packs }) => (
        <section
          key={category.id}
          className="pack-shelf stack"
          aria-labelledby={`shelf-${category.id}`}
        >
          <div className="pack-shelf__head">
            <div>
              <h2 id={`shelf-${category.id}`}>{category.label}</h2>
              <p className="muted">{category.blurb}</p>
            </div>
            {packs.length > SHELF_SIZE && (
              <Button size="sm" variant="ghost" onClick={() => props.onSeeAll(category.id)}>
                See all {packs.length}
                <span className="sr-only"> in {category.label}</span>
              </Button>
            )}
          </div>
          <TileGrid
            packs={packs.slice(0, SHELF_SIZE)}
            label={category.label}
            onOpen={props.onOpen}
          />
        </section>
      ))}
    </>
  )
}

export function DiscoverTab(props: {
  packs: readonly StorePack[]
  hasCatalogs: boolean
  filter: StoreFilter
  onFilter: (f: StoreFilter) => void
  onOpen: (id: string) => void
}) {
  const { busy, failed, refresh } = useCatalogRefresh(props.hasCatalogs)
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of props.packs) m.set(p.category.id, (m.get(p.category.id) ?? 0) + 1)
    return m
  }, [props.packs])
  const filtered = isFiltered(props.filter)
  const results = useMemo(
    () => (filtered ? filterStore(props.packs, props.filter) : []),
    [filtered, props.packs, props.filter],
  )

  return (
    <div className="stack pack-discover">
      <StoreFilters value={props.filter} onChange={props.onFilter} counts={counts} />
      <div className="row pack-toolbar">
        <p className="muted" role="status">
          {busy
            ? 'Refreshing catalogs…'
            : filtered
              ? `${results.length} of ${props.packs.length} packs`
              : `${props.packs.length} packs`}
        </p>
        {props.hasCatalogs && (
          <div className="row">
            <Link className="btn btn--sm btn--ghost" to="/settings">
              Manage catalogs
            </Link>
            <Button size="sm" disabled={busy} onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
        )}
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
      {filtered ? (
        results.length ? (
          <TileGrid packs={results} label={`${results.length} packs`} onOpen={props.onOpen} />
        ) : (
          <EmptyState
            title="No packs match"
            actions={<Button onClick={() => props.onFilter(NO_STORE_FILTER)}>Clear filters</Button>}
          />
        )
      ) : (
        <>
          {!props.hasCatalogs && <CatalogOffer />}
          <Featured packs={props.packs} onOpen={props.onOpen} />
          <Shelves
            packs={props.packs}
            onOpen={props.onOpen}
            onSeeAll={(category) => props.onFilter({ ...NO_STORE_FILTER, category })}
          />
        </>
      )}
    </div>
  )
}
