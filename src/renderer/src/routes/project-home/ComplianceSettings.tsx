// Settings › Compliance (#426, spec 0426 FR-3): the reporting regulations and control frameworks
// this project uses. The domain profile suggests some; any from installed packs can be added.
// Each regulation shows its status, sources and when its values were last checked; a proposed
// rule says so. Switches save at once (project.json `compliance`).
import type { ComplianceSource, ListedFramework, ListedRegulation } from '@shared/ipc'
import {
  NOT_LEGAL_ADVICE,
  REGULATION_STATUS_LABEL,
  type RegulationStatus,
} from '@shared/schemas/compliance'
import { Badge } from '../../components/ui'
import { errorText } from '../../lib/errors'
import { useIpcMutation, useIpcQuery } from '../../lib/query'

const STATUS_TONE: Record<RegulationStatus, 'ok' | 'warn' | 'info' | 'neutral'> = {
  in_force: 'ok',
  proposed: 'warn',
  guidance: 'info',
  superseded: 'neutral',
}

function sourceText(s: ComplianceSource): string {
  if (s.layer === 'project') return 'Project copy'
  const name = s.packName ?? s.packId ?? 'pack'
  return s.layer === 'bundled' ? `Included: ${name}` : `Pack: ${name} ${s.packVersion ?? ''}`.trim()
}

const formatDay = (iso: string): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'medium' })

function RegulationItem(props: {
  item: ListedRegulation
  disabled: boolean
  onToggle: (on: boolean) => void
}) {
  const { regulation: r, enabled, suggested, source } = props.item
  const id = `comp-reg-${r.id}`
  return (
    <li className="compliance-item">
      <div className="compliance-item__head">
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          disabled={props.disabled}
          onChange={(e) => props.onToggle(e.target.checked)}
          aria-describedby={`${id}-meta`}
        />
        <label htmlFor={id}>{r.label}</label>
        <Badge tone={STATUS_TONE[r.status]}>{REGULATION_STATUS_LABEL[r.status]}</Badge>
        {suggested && <span className="muted">Suggested for this domain</span>}
      </div>
      <div id={`${id}-meta`} className="compliance-item__meta muted">
        {r.status === 'proposed' && (
          <p>The deadlines come from a proposed rule and may change in the final rule.</p>
        )}
        <p>
          {r.jurisdiction} · {r.authority} · {r.citation}
        </p>
        <p>
          {r.clocks.map((c) => c.label).join(', ')} · Last checked {formatDay(r.verifiedOn)} ·{' '}
          {sourceText(source)}
        </p>
        {r.statusNote && <p>{r.statusNote}</p>}
      </div>
      <ul className="compliance-item__sources">
        {r.sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </li>
  )
}

function FrameworkItem(props: {
  item: ListedFramework
  disabled: boolean
  onToggle: (on: boolean) => void
}) {
  const { framework: f, enabled, suggested, source } = props.item
  const id = `comp-fw-${f.id}`
  return (
    <li className="compliance-item">
      <div className="compliance-item__head">
        <input
          id={id}
          type="checkbox"
          checked={enabled}
          disabled={props.disabled}
          onChange={(e) => props.onToggle(e.target.checked)}
          aria-describedby={`${id}-meta`}
        />
        <label htmlFor={id}>{f.label}</label>
        {suggested && <span className="muted">Suggested for this domain</span>}
      </div>
      <p id={`${id}-meta`} className="compliance-item__meta muted">
        {f.publisher} · {f.version} · {f.controls.length} controls · Last checked{' '}
        {formatDay(f.verifiedOn)} · {sourceText(source)}
      </p>
    </li>
  )
}

export function ComplianceSettings({ path }: { path: string }) {
  const list = useIpcQuery('compliance:list', { projectPath: path })
  const save = useIpcMutation('compliance:set', { invalidates: ['compliance:list'] })
  const busy = save.isPending
  const set = (kind: 'regulations' | 'frameworks', id: string, on: boolean) =>
    save.mutate({ projectPath: path, [kind]: { [id]: on } })
  return (
    <section className="card stack compliance-settings" aria-labelledby="compliance-title">
      <h2 id="compliance-title">Compliance</h2>
      <p className="muted">
        Reporting clocks run in Facilitate for the regulations switched on here. The frameworks
        decide what the compliance coverage export lists. {NOT_LEGAL_ADVICE}
      </p>
      {list.isLoading && <p className="muted">Loading regulations…</p>}
      {list.error && (
        <p className="field__error" role="alert">
          Could not load the regulations: {errorText(list.error)}
        </p>
      )}
      {save.error && (
        <p className="field__error" role="alert">
          Could not save: {errorText(save.error)}
        </p>
      )}
      {list.data && (
        <>
          <fieldset className="compliance-group">
            <legend>Reporting regulations</legend>
            <ul className="compliance-list">
              {list.data.regulations.map((item) => (
                <RegulationItem
                  key={item.regulation.id}
                  item={item}
                  disabled={busy}
                  onToggle={(on) => set('regulations', item.regulation.id, on)}
                />
              ))}
            </ul>
          </fieldset>
          <fieldset className="compliance-group">
            <legend>Model-assisted mapping</legend>
            <div className="compliance-item__head">
              <input
                id="comp-model-mapping"
                type="checkbox"
                checked={list.data.modelMapping}
                disabled={busy}
                aria-describedby="comp-model-mapping-meta"
                onChange={(e) => save.mutate({ projectPath: path, modelMapping: e.target.checked })}
              />
              <label htmlFor="comp-model-mapping">
                Let the model suggest controls for MSEL rows
              </label>
            </div>
            <p id="comp-model-mapping-meta" className="compliance-item__meta muted">
              Off by default. When on, the Controls dialog of an MSEL row can send that row&apos;s
              text and the control list to the model set for reviews. Suggestions are never accepted
              for you.
            </p>
          </fieldset>
          <fieldset className="compliance-group">
            <legend>Control frameworks</legend>
            <ul className="compliance-list">
              {list.data.frameworks.map((item) => (
                <FrameworkItem
                  key={item.framework.id}
                  item={item}
                  disabled={busy}
                  onToggle={(on) => set('frameworks', item.framework.id, on)}
                />
              ))}
            </ul>
          </fieldset>
        </>
      )}
    </section>
  )
}
