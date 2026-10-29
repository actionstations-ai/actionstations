// Review before install (#268, ADR-0018): everything about an archive the user is about to
// install, from a catalog, a URL or a file. The Install / Update button exists only here.
import { useState } from 'react'
import type { PackInspectRequest, PackReview } from '@shared/ipc'
import type { PackProblem } from '@shared/schemas/pack'
import { Badge, Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import { PackDescription } from './PackDescription'
import {
  KIND_LABEL,
  actionLabel,
  archiveShaText,
  contributorText,
  sourceLabel,
  formatBytes,
  itemsByKind,
  replacesText,
  sourceText,
} from './pack-format'

const INVALIDATES = ['packs:list', 'packs:updates'] as const

function Facts({ r }: { r: PackReview }) {
  const hashNote =
    r.source.kind === 'catalog'
      ? 'Matches the sha256 the catalog lists.'
      : 'No catalog vouches for this file: compare this sha256 with the publisher’s page.'
  return (
    <dl className="pack-facts">
      <dt>Id</dt>
      <dd className="mono">{r.id}</dd>
      <dt>Version</dt>
      <dd>{r.version}</dd>
      <dt>Author</dt>
      <dd>
        {r.author.name}
        {r.author.url && <span className="mono pack-facts__sub">{r.author.url}</span>}
      </dd>
      <dt>Source</dt>
      <dd>{sourceLabel(r.id)}</dd>
      {r.contributors.length > 0 && (
        <>
          <dt>Contributors</dt>
          <dd>{r.contributors.map(contributorText).join('; ')}</dd>
        </>
      )}
      {r.homepage && (
        <>
          <dt>Homepage</dt>
          <dd className="mono">{r.homepage}</dd>
        </>
      )}
      <dt>Pack license</dt>
      <dd>{r.license}</dd>
      <dt>Needs app version</dt>
      <dd>{r.minAppVersion} or later</dd>
      <dt>Size</dt>
      <dd>{formatBytes(r.size)}</dd>
      <dt>Source</dt>
      <dd className="pack-break">{sourceText(r.source)}</dd>
      <dt>Archive sha256</dt>
      <dd>
        <span className="mono pack-break">{archiveShaText(r.archiveSha256)}</span>
        <span className="pack-facts__sub">{hashNote}</span>
      </dd>
      {r.domains.length > 0 && (
        <>
          <dt>Domains</dt>
          <dd>{r.domains.join(', ')}</dd>
        </>
      )}
      {r.tags.length > 0 && (
        <>
          <dt>Tags</dt>
          <dd>{r.tags.join(', ')}</dd>
        </>
      )}
    </dl>
  )
}

function Contents({ r }: { r: PackReview }) {
  return (
    <section className="stack" aria-labelledby="pack-contents-heading">
      <h3 id="pack-contents-heading">Contents</h3>
      {itemsByKind(r.items).map(([kind, items]) => (
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
                {i.customNodes && i.customNodes.length > 0 && (
                  <Badge tone="warn">Needs custom nodes</Badge>
                )}
                {i.optionalNodes && i.optionalNodes.length > 0 && (
                  <Badge tone="info">Uses optional custom nodes</Badge>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

function Documents({ r }: { r: PackReview }) {
  if (r.documents.length === 0) return null
  return (
    <section className="stack" aria-labelledby="pack-docs-heading">
      <h3 id="pack-docs-heading">Document licenses</h3>
      <div className="pack-table-wrap">
        <table className="table">
          <caption className="sr-only">
            Every reference document with its source and license
          </caption>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Source</th>
              <th scope="col">License</th>
            </tr>
          </thead>
          <tbody>
            {r.documents.map((d) => (
              <tr key={d.path}>
                <th scope="row">{d.title}</th>
                <td>{d.source ?? 'Not stated'}</td>
                <td>{d.license}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Warnings({ r }: { r: PackReview }) {
  return (
    <>
      {r.customNodes.length > 0 && (
        <section className="pack-callout pack-callout--warn" aria-labelledby="pack-nodes-heading">
          <h3 id="pack-nodes-heading">Needs custom ComfyUI nodes</h3>
          <p>
            These workflows use node classes outside ComfyUI core. Custom nodes run code on your
            ComfyUI server; install them only from sources you trust.
          </p>
          <ul className="mono">
            {r.customNodes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
      {r.optionalNodes && r.optionalNodes.length > 0 && (
        <section className="pack-callout" aria-labelledby="pack-optional-nodes-heading">
          <h3 id="pack-optional-nodes-heading">Uses optional custom ComfyUI nodes</h3>
          <p>
            These workflows use the nodes below when your ComfyUI has them and run without them
            otherwise. The pack does not install them. Custom nodes run code on your ComfyUI server;
            install them only from sources you trust.
          </p>
          <ul className="mono">
            {r.optionalNodes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      )}
      {(r.conflict || r.conflicts.length > 0) && (
        <section
          className="pack-callout pack-callout--warn"
          aria-labelledby="pack-conflict-heading"
        >
          <h3 id="pack-conflict-heading">Conflicts</h3>
          {r.conflict && <p>{r.conflict}</p>}
          {r.conflicts.length > 0 && (
            <ul>
              {r.conflicts.map((c) => (
                <li key={`${c.kind}:${c.id}`}>
                  {KIND_LABEL[c.kind].one} <span className="mono">{c.id}</span> is already provided
                  by {c.packName}
                </li>
              ))}
            </ul>
          )}
          {!r.willEnable && <p>The pack installs disabled. Resolve the conflict to enable it.</p>}
        </section>
      )}
    </>
  )
}

function Problems({ problems, onBack }: { problems: PackProblem[]; onBack: () => void }) {
  return (
    <section className="card stack" aria-labelledby="pack-review-heading">
      <h2 id="pack-review-heading">This pack cannot be installed</h2>
      <ul className="pack-problems">
        {problems.map((p, i) => (
          <li key={i}>
            {p.path && <span className="mono">{p.path}: </span>}
            {p.message}
          </li>
        ))}
      </ul>
      <div className="row">
        <Button onClick={onBack}>Back</Button>
      </div>
    </section>
  )
}

function InstallBar(props: {
  r: PackReview
  request: PackInspectRequest
  onDone: () => void
  onBack: () => void
}) {
  const { r } = props
  const [confirmDowngrade, setConfirmDowngrade] = useState(false)
  const install = useIpcMutation('packs:install', { invalidates: [...INVALIDATES] })
  const path = 'filePath' in props.request ? props.request.filePath : props.request.downloadedPath
  const blocked = r.action === 'downgrade' && !confirmDowngrade
  const run = () =>
    install.mutate(
      { path, source: r.source, ...(r.action === 'downgrade' ? { confirmDowngrade } : {}) },
      {
        onSuccess: ({ pack }) => {
          toast.success(
            r.action === 'update'
              ? `${pack.name} updated to ${pack.version}`
              : `${pack.name} installed`,
            pack.enabled ? undefined : 'Installed disabled; see the conflict on the Installed tab.',
          )
          props.onDone()
        },
        onError: (err) => toast.error('Could not install the pack', err),
      },
    )
  return (
    <div className="stack pack-install-bar">
      {r.installed && (
        <p className="muted">
          Version {r.installed.version} is installed ({r.installed.enabled ? 'enabled' : 'disabled'}
          ).
        </p>
      )}
      {r.action === 'downgrade' && (
        <label className="row pack-check">
          <input
            type="checkbox"
            checked={confirmDowngrade}
            onChange={(e) => setConfirmDowngrade(e.target.checked)}
          />
          Replace the installed {r.installed?.version} with the older {r.version}
        </label>
      )}
      {install.error && (
        <p className="field__error" role="alert">
          {errorText(install.error)}
        </p>
      )}
      <div className="row">
        <Button variant="primary" disabled={blocked || install.isPending} onClick={run}>
          {install.isPending ? 'Installing…' : actionLabel(r.action, r.version)}
        </Button>
        <Button onClick={props.onBack} disabled={install.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

/** Review an archive (picked file, dropped file, opened file or staged download). */
export function PackReviewView(props: {
  request: PackInspectRequest
  onDone: () => void
  onBack: () => void
}) {
  const inspect = useIpcQuery('packs:inspect', props.request, { staleTime: 0, gcTime: 0 })
  if (inspect.isPending)
    return (
      <p className="muted" role="status">
        Checking the pack…
      </p>
    )
  if (inspect.error)
    return <Problems problems={[{ message: errorText(inspect.error) }]} onBack={props.onBack} />
  const res = inspect.data
  if (!res.ok) return <Problems problems={res.problems} onBack={props.onBack} />
  const r = res.review
  return (
    <section className="card stack pack-review" aria-labelledby="pack-review-heading">
      <div className="stack pack-review__head">
        <span className="page-header__eyebrow">Review before installing</span>
        <h2 id="pack-review-heading">
          {r.name} <span className="muted">{r.version}</span>
        </h2>
        <p>{r.summary}</p>
      </div>
      <PackDescription source={r.description} label={`About ${r.name}`} />
      <Facts r={r} />
      <Warnings r={r} />
      <Contents r={r} />
      <Documents r={r} />
      <InstallBar r={r} request={props.request} onDone={props.onDone} onBack={props.onBack} />
    </section>
  )
}
