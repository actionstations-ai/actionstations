// Installed packs (#268): version, source, enabled switch, update, broken and conflict state,
// details and uninstall. Updates come from the cached catalogs (no network here). Above them,
// "Included with the app" lists the bundled packs (ADR-0020): an enabled switch (the core pack
// is always on) and details, no Uninstall or update (they update with the app).
import { useState } from 'react'
import type { InstalledPackView, PackUpdateView } from '@shared/ipc'
import { Badge, Button, Dialog, EmptyState } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { PackDescription } from './PackDescription'
import {
  KIND_LABEL,
  archiveShaText,
  countsText,
  itemsByKind,
  replacesText,
  sourceText,
  updateFor,
} from './pack-format'

const INVALIDATES = ['packs:list', 'packs:updates'] as const

function PackDetails({ pack }: { pack: InstalledPackView }) {
  return (
    <div className="stack pack-details">
      <PackDescription source={pack.description} label={`About ${pack.name}`} />
      <dl className="pack-facts">
        <dt>Id</dt>
        <dd className="mono">{pack.id}</dd>
        {pack.author && (
          <>
            <dt>Author</dt>
            <dd>{pack.author.name}</dd>
          </>
        )}
        {pack.license && (
          <>
            <dt>Pack license</dt>
            <dd>{pack.license}</dd>
          </>
        )}
        {pack.bundled ? (
          <>
            <dt>Version</dt>
            <dd>{pack.version} (updates with the app)</dd>
          </>
        ) : (
          <>
            <dt>Installed</dt>
            <dd>{new Date(pack.installedAt).toLocaleString()}</dd>
            <dt>Archive sha256</dt>
            <dd className="mono pack-break">{archiveShaText(pack.archiveSha256)}</dd>
          </>
        )}
      </dl>
      {itemsByKind(pack.items).map(([kind, items]) => (
        <div key={kind} className="stack pack-kind">
          <h4>
            {KIND_LABEL[kind].many} ({items.length})
          </h4>
          <ul className="pack-items">
            {items.map((i) => (
              <li key={i.id}>
                <span>{i.title}</span> <span className="mono muted">{i.id}</span>
                {i.replacesBuiltin && (
                  <Badge tone="info">{replacesText(i, KIND_LABEL[kind].one)}</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function EnabledSwitch({ pack }: { pack: InstalledPackView }) {
  const set = useIpcMutation('packs:setEnabled', {
    invalidates: [...INVALIDATES, 'domains:list', 'templates:list', 'templates:taxonomy'],
  })
  const id = `pack-enabled-${pack.id}`
  const hintId = `${id}-hint`
  return (
    <span className="row pack-switch">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={pack.enabled}
        aria-describedby={pack.core ? hintId : undefined}
        disabled={set.isPending || !!pack.broken || !!pack.core}
        onChange={(e) =>
          set.mutate(
            { id: pack.id, enabled: e.target.checked },
            { onError: (err) => toast.error(`Could not change ${pack.name}`, err) },
          )
        }
      />
      <label htmlFor={id}>Enabled</label>
      {pack.core && (
        <span id={hintId} className="muted">
          Always on: the app needs it.
        </span>
      )}
    </span>
  )
}

function PackRow(props: {
  pack: InstalledPackView
  update: PackUpdateView | undefined
  onUpdate: (u: PackUpdateView, name: string) => void
  /** Absent for bundled packs: they have no Uninstall. */
  onUninstall?: ((p: InstalledPackView) => void) | undefined
  updating: boolean
}) {
  const { pack, update } = props
  const [open, setOpen] = useState(false)
  const detailsId = `pack-details-${pack.id}`
  return (
    <li className="card stack pack-row" aria-labelledby={`${detailsId}-name`}>
      <div className="row pack-row__head">
        <div className="stack pack-row__text">
          <h3 id={`${detailsId}-name`} className="pack-row__name">
            {pack.name} <span className="muted">{pack.version}</span>
          </h3>
          <p className="muted">{pack.summary}</p>
          <p className="pack-row__meta">
            <span>{countsText(pack.items) || 'No items'}</span>
            <span className="pack-break">{sourceText(pack.source)}</span>
          </p>
        </div>
        <div className="row pack-row__badges">
          {pack.broken ? (
            <Badge tone="error">Broken</Badge>
          ) : pack.conflict ? (
            <Badge tone="warn">Conflict</Badge>
          ) : (
            <Badge tone={pack.enabled ? 'ok' : 'neutral'}>
              {pack.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          )}
          {update && <Badge tone="info">Update available: {update.latest.version}</Badge>}
        </div>
      </div>
      {pack.broken && (
        <p className="pack-callout pack-callout--error">
          {pack.broken}{' '}
          {pack.bundled ? 'Reinstall the app to repair it.' : 'Reinstall the pack or uninstall it.'}
        </p>
      )}
      {pack.conflict && <p className="pack-callout pack-callout--warn">{pack.conflict}</p>}
      <div className="row pack-row__actions">
        <EnabledSwitch pack={pack} />
        {update && (
          <Button
            size="sm"
            variant="primary"
            disabled={props.updating}
            onClick={() => props.onUpdate(update, pack.name)}
          >
            Review update to {update.latest.version}
          </Button>
        )}
        <Button
          size="sm"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Hide details' : 'Details'}
          <span className="sr-only"> for {pack.name}</span>
        </Button>
        {props.onUninstall && (
          <Button size="sm" variant="danger" onClick={() => props.onUninstall?.(pack)}>
            Uninstall<span className="sr-only"> {pack.name}</span>
          </Button>
        )}
      </div>
      <div id={detailsId} hidden={!open}>
        {open && <PackDetails pack={pack} />}
      </div>
    </li>
  )
}

function UninstallDialog(props: { pack: InstalledPackView | null; onClose: () => void }) {
  const remove = useIpcMutation('packs:uninstall', { invalidates: [...INVALIDATES] })
  const pack = props.pack
  return (
    <Dialog
      open={!!pack}
      onOpenChange={(o) => !o && props.onClose()}
      title={pack ? `Uninstall ${pack.name}?` : 'Uninstall'}
      description="Projects keep the copies of templates, workflows, documents and domain profiles they already use, so they keep working. Prompts from the pack stop applying to new generation."
      footer={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button
            variant="danger"
            disabled={remove.isPending}
            onClick={() =>
              pack &&
              remove.mutate(
                { id: pack.id },
                {
                  onSuccess: () => {
                    toast.success(`${pack.name} uninstalled`)
                    props.onClose()
                  },
                  onError: (err) => toast.error('Could not uninstall the pack', err),
                },
              )
            }
          >
            Uninstall
          </Button>
        </>
      }
    >
      {pack && <p className="mono">{pack.id}</p>}
    </Dialog>
  )
}

/** "Included with the app": the bundled packs (ADR-0020). */
function IncludedSection({ packs }: { packs: InstalledPackView[] }) {
  if (packs.length === 0) return null
  return (
    <section className="stack" aria-labelledby="packs-included-title">
      <h2 id="packs-included-title" className="pack-section__title">
        Included with the app
      </h2>
      <p className="muted">
        Turn off a domain you never exercise: it leaves the pickers and galleries. Projects that
        already use it keep working.
      </p>
      <ul className="stack pack-list" aria-label="Included with the app">
        {packs.map((p) => (
          <PackRow key={p.id} pack={p} update={undefined} onUpdate={() => {}} updating={false} />
        ))}
      </ul>
    </section>
  )
}

export function InstalledTab(props: {
  onUpdate: (u: PackUpdateView, name: string) => void
  onBrowse: () => void
  onInstallFile: () => void
  updating: boolean
}) {
  const list = useIpcQuery('packs:list', undefined)
  const updates = useIpcQuery('packs:updates', undefined)
  const verify = useIpcMutation('packs:verify', { invalidates: [...INVALIDATES] })
  const [uninstalling, setUninstalling] = useState<InstalledPackView | null>(null)

  if (list.isPending) return <p className="muted">Loading installed packs…</p>
  if (list.error)
    return (
      <p className="field__error" role="alert">
        {errorText(list.error)}
      </p>
    )
  const included = list.data.filter((p) => p.bundled)
  const packs = list.data.filter((p) => !p.bundled)
  const includedSection = <IncludedSection packs={included} />
  if (packs.length === 0)
    return (
      <div className="stack">
        {includedSection}
        <EmptyState
          title="No packs installed"
          body="Packs add templates, prompts, domain profiles, ComfyUI workflows, reference documents and example projects. Browse a catalog or install an .aspack file; every pack is reviewed before it installs."
          actions={
            <>
              <Button variant="primary" onClick={props.onBrowse}>
                Browse catalogs
              </Button>
              <Button onClick={props.onInstallFile}>Install from file…</Button>
            </>
          }
        />
      </div>
    )
  return (
    <div className="stack">
      {includedSection}
      <h2 className="pack-section__title">Installed</h2>
      <div className="row pack-toolbar">
        <p className="muted">
          {packs.length} installed, {packs.filter((p) => p.enabled).length} enabled
        </p>
        <Button
          size="sm"
          disabled={verify.isPending}
          onClick={() =>
            verify.mutate(
              {},
              {
                onSuccess: (r) => {
                  const bad = r.filter((v) => !v.ok)
                  if (bad.length === 0) toast.success('Every installed file matches its hash')
                  else toast.error(`${bad.length} pack(s) changed on disk`, bad[0]?.problem)
                },
                onError: (err) => toast.error('Could not check the packs', err),
              },
            )
          }
        >
          {verify.isPending ? 'Checking…' : 'Check files'}
        </Button>
      </div>
      <ul className="stack pack-list" aria-label="Installed packs">
        {packs.map((p) => (
          <PackRow
            key={p.id}
            pack={p}
            update={updateFor(p.id, updates.data)}
            onUpdate={props.onUpdate}
            onUninstall={setUninstalling}
            updating={props.updating}
          />
        ))}
      </ul>
      <UninstallDialog pack={uninstalling} onClose={() => setUninstalling(null)} />
    </div>
  )
}
