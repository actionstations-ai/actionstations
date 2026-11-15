// A pack's page in the store (#1152): header with the main action, a stats strip, what is
// inside by kind, the description, the other packs of the same field, and the details (id,
// license, source, archive hash). Installing still goes through the review (ADR-0018).
import { useEffect, useRef, useState } from 'react'
import type { InstalledPackView, PackUpdateView } from '@shared/ipc'
import { STORE_KIND_LABEL } from '@shared/packs/store'
import { Badge, Button } from '../../components/ui'
import { ItemWarnings } from './ItemWarnings'
import { EnabledSwitch, UninstallDialog } from './pack-controls'
import { PackDescription } from './PackDescription'
import {
  KIND_LABEL,
  archiveShaText,
  contributorText,
  creditLine,
  endorsementText,
  formatBytes,
  itemsByKind,
  replacesText,
  sourceLabel,
  sourceText,
  type BrowseEntry,
} from './pack-format'
import { contentsLine, fieldLabel, sameField, type StorePack } from './store-model'
import { PackIcon, TileGrid } from './StoreTile'

interface Actions {
  onGet: (entry: BrowseEntry) => void
  onUpdate: (u: PackUpdateView, name: string) => void
  busy: boolean
}

function MainAction({ pack, actions }: { pack: StorePack; actions: Actions }) {
  const [uninstalling, setUninstalling] = useState<InstalledPackView | null>(null)
  const p = pack.installed
  return (
    <div className="pack-hero__actions">
      {pack.state.kind === 'available' && pack.entry && (
        <Button
          variant="primary"
          disabled={actions.busy}
          onClick={() => actions.onGet(pack.entry!)}
        >
          Get<span className="sr-only"> {pack.name}</span>
        </Button>
      )}
      {pack.update && (
        <Button
          variant="primary"
          disabled={actions.busy}
          onClick={() => actions.onUpdate(pack.update!, pack.name)}
        >
          Review update to {pack.update.latest.version}
        </Button>
      )}
      {p && !p.broken && <EnabledSwitch pack={p} label="On" />}
      {p && !p.bundled && (
        <Button variant="danger" onClick={() => setUninstalling(p)}>
          Uninstall<span className="sr-only"> {pack.name}</span>
        </Button>
      )}
      {pack.state.kind === 'available' && (
        <p className="muted pack-hero__note">
          You review every file and license before it installs.
        </p>
      )}
      <UninstallDialog pack={uninstalling} onClose={() => setUninstalling(null)} />
    </div>
  )
}

function Stats({ pack }: { pack: StorePack }) {
  const e = pack.entry?.entry
  const items = pack.installed?.items.length
  const stats: [string, string][] = [
    ['Kind', STORE_KIND_LABEL[pack.kind].one],
    ['Category', pack.category.label],
    ['Version', pack.version],
    e && !pack.installed ? ['Download', formatBytes(e.size)] : ['Items', String(items ?? 0)],
    ['License', pack.installed?.license ?? e?.license ?? 'Not stated'],
    ['Source', pack.installed?.bundled ? 'Included with the app' : sourceLabel(pack.id)],
  ]
  return (
    <dl className="pack-stats" aria-label="At a glance">
      {stats.map(([k, v]) => (
        <div key={k} className="pack-stat">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  )
}

function Inside({ pack }: { pack: StorePack }) {
  const p = pack.installed
  if (!p)
    return (
      <section className="stack pack-section" aria-labelledby="pack-inside">
        <h2 id="pack-inside">What’s inside</h2>
        <p>{contentsLine(pack.counts, KIND_LABEL)}</p>
        <p className="muted">
          Every item, document and license is listed in the review before the pack installs.
        </p>
      </section>
    )
  return (
    <section className="stack pack-section" aria-labelledby="pack-inside">
      <h2 id="pack-inside">What’s inside</h2>
      <p className="muted">{contentsLine(pack.counts, KIND_LABEL) || 'No items'}</p>
      {itemsByKind(p.items).map(([kind, items]) => (
        <details key={kind} className="pack-kind">
          <summary>
            {KIND_LABEL[kind].many} <span className="muted">({items.length})</span>
          </summary>
          <ul className="pack-items">
            {items.map((i) => (
              <li key={i.id}>
                <span>{i.title}</span> <span className="mono muted">{i.id}</span>
                {i.replacesBuiltin && (
                  <Badge tone="info">{replacesText(i, KIND_LABEL[kind].one)}</Badge>
                )}
                <ItemWarnings warnings={i.warnings} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  )
}

function Details({ pack }: { pack: StorePack }) {
  const p = pack.installed
  const e = pack.entry?.entry
  const contributors = p?.contributors ?? e?.contributors ?? []
  return (
    <section className="stack pack-section" aria-labelledby="pack-details-title">
      <h2 id="pack-details-title">Details</h2>
      <dl className="pack-facts">
        <dt>Id</dt>
        <dd className="mono">{pack.id}</dd>
        {pack.author && (
          <>
            <dt>Author</dt>
            <dd>{pack.author}</dd>
          </>
        )}
        {contributors.length > 0 && (
          <>
            <dt>Contributors</dt>
            <dd>{contributors.map(contributorText).join('; ')}</dd>
          </>
        )}
        {p && (
          <>
            <dt>Installed from</dt>
            <dd className="pack-break">{sourceText(p.source)}</dd>
          </>
        )}
        {p && !p.bundled && (
          <>
            <dt>Installed</dt>
            <dd>{new Date(p.installedAt).toLocaleString()}</dd>
            <dt>Archive sha256</dt>
            <dd className="mono pack-break">{archiveShaText(p.archiveSha256)}</dd>
          </>
        )}
        {p?.bundled && (
          <>
            <dt>Updates</dt>
            <dd>With the app</dd>
          </>
        )}
        {e && pack.entry && (
          <>
            <dt>Catalog</dt>
            <dd>{pack.entry.catalogName}</dd>
            <dt>Needs app version</dt>
            <dd>{e.minAppVersion} or later</dd>
            {!p && (
              <>
                <dt>Archive sha256</dt>
                <dd className="mono pack-break">{e.sha256}</dd>
              </>
            )}
          </>
        )}
        {e?.endorsements && (
          <>
            <dt>Endorsements</dt>
            <dd>{endorsementText(e.endorsements)}</dd>
          </>
        )}
      </dl>
    </section>
  )
}

export function PackPage(
  props: {
    pack: StorePack
    packs: readonly StorePack[]
    onOpen: (id: string) => void
    onBack: () => void
  } & Actions,
) {
  const { pack } = props
  const related = sameField(pack, props.packs)
  const p = pack.installed
  // A new page starts at its top, with focus on the pack's name (for screen readers too).
  const top = useRef<HTMLElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    top.current?.scrollIntoView?.({ block: 'start' })
    title.current?.focus({ preventScroll: true })
  }, [pack.id])
  return (
    <article className="stack pack-page" aria-labelledby="pack-title" ref={top}>
      <nav aria-label="Breadcrumb">
        <Button size="sm" variant="ghost" onClick={props.onBack}>
          ← Packs
        </Button>
        <span className="muted"> / {pack.category.label}</span>
      </nav>
      <header className="pack-hero">
        <PackIcon pack={pack} size="lg" />
        <div className="stack pack-hero__text">
          <h2 id="pack-title" className="pack-hero__name" ref={title} tabIndex={-1}>
            {pack.name}
          </h2>
          <p>{pack.summary}</p>
          <p className="muted">
            By{' '}
            {pack.entry
              ? creditLine(pack.entry.entry.author.name, pack.entry.entry.contributors)
              : (pack.author ?? 'an unknown author')}
            {pack.field && pack.kind !== 'field' && (
              <> · Part of {fieldLabel(pack.field, props.packs)}</>
            )}
          </p>
        </div>
        <MainAction pack={pack} actions={props} />
      </header>
      {p?.broken && (
        <p className="pack-callout pack-callout--error">
          {p.broken}{' '}
          {p.bundled ? 'Reinstall the app to repair it.' : 'Reinstall the pack or uninstall it.'}
        </p>
      )}
      {p?.conflict && <p className="pack-callout pack-callout--warn">{p.conflict}</p>}
      <Stats pack={pack} />
      <Inside pack={pack} />
      {p && p.description.trim() && (
        <section className="stack pack-section" aria-labelledby="pack-about">
          <h2 id="pack-about">About</h2>
          <PackDescription source={p.description} label={`About ${pack.name}`} topHeading={3} />
        </section>
      )}
      {related.length > 0 && pack.field && (
        <section className="stack pack-section" aria-labelledby="pack-related">
          <h2 id="pack-related">More for {fieldLabel(pack.field, props.packs)}</h2>
          <TileGrid packs={related} label="Packs of the same field" onOpen={props.onOpen} />
        </section>
      )}
      <Details pack={pack} />
    </article>
  )
}
