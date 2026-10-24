// Steps 4–6: review (main builds the pack and runs the pack reader on it), save (main asks
// where and writes it only when the reader accepted it), share (the pull-request steps for the
// site repository; the contribution page opens only on a click).
import { useEffect } from 'react'
import type { PackProblem } from '@shared/schemas/pack'
import { Button } from '../../components/ui'
import { call } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useIpcMutation } from '../../lib/query'
import { formatBytes, toRequest, type WizardState } from './wizard-model'
import type { PackExportCheck, SavedPack } from './types'

export function Problems({ problems }: { problems: PackProblem[] }) {
  return (
    <div role="alert" className="pe-problems">
      <p>The pack cannot be saved:</p>
      <ul>
        {problems.map((p, i) => (
          <li key={i}>
            {p.path && <span className="mono">{p.path}: </span>}
            {p.message}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Built({ r }: { r: Extract<PackExportCheck, { ok: true }> }) {
  return (
    <div className="stack">
      <dl className="pe-facts">
        <dt>File</dt>
        <dd className="mono">{r.fileName}</dd>
        <dt>Size</dt>
        <dd>
          {formatBytes(r.size)}, {r.fileCount} files
        </dd>
        <dt>sha256</dt>
        <dd className="mono pe-hash">{r.sha256}</dd>
      </dl>
      <table className="pe-table">
        <caption className="sr-only">Items in the pack</caption>
        <thead>
          <tr>
            <th scope="col">Kind</th>
            <th scope="col">Item</th>
            <th scope="col">License</th>
            <th scope="col">Size</th>
          </tr>
        </thead>
        <tbody>
          {r.items.map((it) => (
            <tr key={`${it.kind}/${it.id}`}>
              <td>{it.kind}</td>
              <td>
                {it.title} <span className="mono muted">{it.id}</span>
                {it.customNodes?.length ? (
                  <span className="muted"> — needs custom nodes: {it.customNodes.join(', ')}</span>
                ) : null}
              </td>
              <td className="mono">{it.license}</td>
              <td>{formatBytes(it.size)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {r.skipped.length > 0 && (
        <details>
          <summary>{r.skipped.length} project files left out of the example</summary>
          <ul>
            {r.skipped.map((s) => (
              <li key={s.path}>
                <span className="mono">{s.path}</span>: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

export function ReviewStep(props: { state: WizardState; onChecked: (ok: boolean) => void }) {
  const check = useIpcMutation('packs:exportCheck')
  const { onChecked, state } = props
  const { mutate } = check
  useEffect(() => {
    mutate(toRequest(state), { onSuccess: (r) => onChecked(r.ok), onError: () => onChecked(false) })
    // Run once per visit to the step; going back and changing anything visits it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (check.isPending || check.isIdle)
    return (
      <p className="muted" role="status">
        Building and checking the pack…
      </p>
    )
  if (check.isError)
    return (
      <p role="alert" className="field__error">
        {errorText(check.error)}
      </p>
    )
  const r = check.data
  return r.ok ? <Built r={r} /> : <Problems problems={r.problems} />
}

export function SaveStep(props: {
  state: WizardState
  fileName: string
  onSaved: (r: SavedPack) => void
}) {
  const save = useIpcMutation('packs:exportSave')
  const run = async () => {
    const r = await save.mutateAsync(toRequest(props.state)).catch(() => undefined)
    if (r?.ok && !r.canceled) props.onSaved(r)
  }
  const r = save.data
  return (
    <div className="stack">
      <p>
        The pack passed the same checks as an install. Save it as{' '}
        <span className="mono">{props.fileName}</span>.
      </p>
      <div className="row">
        <Button variant="primary" disabled={save.isPending} onClick={() => void run()}>
          Save pack…
        </Button>
      </div>
      {r?.ok && r.canceled && (
        <p className="muted" role="status">
          Not saved.
        </p>
      )}
      {r && !r.ok && <Problems problems={r.problems} />}
      {save.isError && (
        <p role="alert" className="field__error">
          {errorText(save.error)}
        </p>
      )}
    </div>
  )
}

export function ShareStep({ saved }: { saved: SavedPack }) {
  return (
    <div className="stack">
      <p role="status">
        Saved <span className="mono">{saved.path}</span>.
      </p>
      <dl className="pe-facts">
        <dt>sha256</dt>
        <dd className="mono pe-hash">{saved.sha256}</dd>
      </dl>
      <p>To list it in the official pack catalog, open a pull request to the site repository:</p>
      <ol className="pe-steps-list">
        <li>Fork the site repository on GitHub.</li>
        <li>
          Add the file as <span className="mono">packs/files/{saved.fileName}</span>.
        </li>
        <li>Open a pull request; paste the sha256 above into its description.</li>
        <li>
          The maintainer validates the pack with the app&apos;s reader, checks the document licenses
          and rebuilds the catalog before merging.
        </li>
      </ol>
      <div className="row">
        <Button onClick={() => void call('packs:openContribution')}>
          Open the contribution page
        </Button>
        <Button variant="ghost" onClick={() => void call('shell:show-item', { path: saved.path })}>
          Show in folder
        </Button>
      </div>
    </div>
  )
}
