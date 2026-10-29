// The parts of the inject editor page: navigation, header, warnings, the regeneration diff,
// the field form and the preview / media / versions side panel.
import { Tabs } from 'radix-ui'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'
import type { TemplateInfo } from '@shared/ipc'
import type { Inject } from '@shared/schemas/inject'
import type { MselRow, Scenario } from '@shared/schemas/scenario'
import { Badge, PageHeader, TagChip } from '../../components/ui'
import { injectAlt } from '../../lib/inject-alt'
import { deckUrl, injectUrl } from './links'
import type { InjectDraft } from './draft'
import { InjectForm } from './InjectForm'
import { MediaPanel } from './MediaPanel'
import { PreviewPanel } from './PreviewPanel'
import type { FieldChange } from './schema/diff'
import { issuesByPath, type FieldIssue } from './schema/validate'
import { ChangeList, VersionsPanel } from './VersionsPanel'

function neighbours(scenario: Scenario, inject: Inject) {
  const ids = scenario.msel.filter((r) => r.injectId).map((r) => r.injectId!)
  const at = ids.indexOf(inject.id)
  return { prev: at > 0 ? ids[at - 1] : undefined, next: at >= 0 ? ids[at + 1] : undefined }
}

export function InjectNav(props: { projectPath: string; scenario: Scenario; inject: Inject }) {
  const { projectPath, scenario } = props
  const { prev, next } = neighbours(scenario, props.inject)
  const linkTo = (id: string) => injectUrl(projectPath, scenario.id, id)
  return (
    <nav className="row inject-editor__nav" aria-label="Inject navigation">
      <Link to={deckUrl(projectPath, scenario.id)} className="back-link">
        <ArrowLeft size={14} aria-hidden /> All injects
      </Link>
      <span className="row">
        {prev ? (
          <Link to={linkTo(prev)} className="btn btn--sm">
            Previous inject
          </Link>
        ) : null}
        {next ? (
          <Link to={linkTo(next)} className="btn btn--sm">
            Next inject
          </Link>
        ) : null}
      </span>
    </nav>
  )
}

export function EditorHeader(props: {
  inject: Inject
  draft: InjectDraft
  row: MselRow | undefined
  typeLabel: string
  dirty: boolean
  issueCount: number
}) {
  const { inject, draft, row } = props
  const when = row ? ` · ${row.time}${row.wallClock ? ` (${row.wallClock})` : ''}` : ''
  return (
    <PageHeader
      eyebrow={`Inject ${inject.mselRowId}${when} · ${props.typeLabel}`}
      title={draft.title || 'Untitled inject'}
      description={row?.event}
      actions={
        <span className="row">
          {row && <TagChip tag={row.purposeTag} />}
          {inject.locked && <Badge tone="warn">Locked</Badge>}
          {props.dirty && <Badge tone="info">Unsaved changes</Badge>}
          {props.issueCount > 0 && <Badge tone="error">{props.issueCount} field issue(s)</Badge>}
        </span>
      }
    />
  )
}

export function InjectWarnings(props: { warnings: Scenario['warnings'] }) {
  if (props.warnings.length === 0) return null
  return (
    <ul className="inject-warnings" aria-label="Warnings for this inject">
      {props.warnings.map((w, i) => (
        <li key={i}>
          <Badge tone={w.severity === 'error' ? 'error' : 'warn'}>{w.code}</Badge>{' '}
          <span className="inject-warnings__message">{w.message}</span>
          {w.suggestion && <span className="inject-warnings__hint"> {w.suggestion}</span>}
        </li>
      ))}
    </ul>
  )
}

export function RegenDiff(props: { changes: FieldChange[] | null; onDismiss: () => void }) {
  if (!props.changes) return null
  return (
    <section className="regen-diff card" aria-label="Changes from regeneration">
      <div className="row regen-diff__head">
        <strong>Regenerated: {props.changes.length} change(s)</strong>
        <button type="button" className="btn btn--sm btn--ghost" onClick={props.onDismiss}>
          Dismiss
        </button>
      </div>
      <ChangeList
        label="Regenerated fields"
        changes={props.changes}
        empty="The text did not change."
      />
    </section>
  )
}

export function EditorForm(props: {
  inject: Inject
  draft: InjectDraft
  setDraft: (d: InjectDraft) => void
  templates: TemplateInfo[]
  template: TemplateInfo | undefined
  variant: string
  issues: FieldIssue[]
  onSave: () => void
  sourceCheck?: ReactNode
  purposeTag?: string | undefined
}) {
  const { inject, draft, setDraft } = props
  return (
    <form
      className="inject-editor__form"
      aria-label="Inject fields"
      onSubmit={(e) => {
        e.preventDefault()
        props.onSave()
      }}
    >
      <fieldset disabled={inject.locked} className="inject-editor__lockable">
        {inject.locked && (
          <p className="lock-note">This inject is locked. Unlock it to edit or regenerate.</p>
        )}
        <InjectForm
          draft={draft}
          onChange={setDraft}
          templates={props.templates}
          template={props.template}
          variant={props.variant}
          onVariant={(v) => setDraft({ ...draft, variant: v })}
          issues={issuesByPath(props.issues)}
          {...(props.sourceCheck ? { sourceCheck: props.sourceCheck } : {})}
          purposeTag={props.purposeTag}
        />
      </fieldset>
    </form>
  )
}

interface SideProps {
  projectPath: string
  scenarioId: string
  inject: Inject
  draft: InjectDraft
  template: TemplateInfo | undefined
  variant: string
  busy: boolean
  onRestore: (versionIndex: number) => void
}

function PreviewTab(props: SideProps) {
  const { inject, draft } = props
  return (
    <PreviewPanel
      template={props.template}
      alt={injectAlt({ ...draft, mselRowId: inject.mselRowId }, 'live preview')}
      refreshKey={inject.assets
        .filter((a) => a.role === 'generated')
        .map((a) => a.id)
        .join(',')}
      request={{
        type: draft.type,
        fields: draft.fields,
        variant: props.variant,
        projectPath: props.projectPath,
        scenarioId: props.scenarioId,
        injectId: inject.id,
      }}
    />
  )
}

export function EditorSide(props: SideProps & { tab: string; onTab: (tab: string) => void }) {
  const { inject, draft } = props
  return (
    <aside className="inject-editor__side" aria-label="Preview and media">
      <Tabs.Root value={props.tab} onValueChange={props.onTab} className="tabs">
        <Tabs.List className="tabs__list" aria-label="Inject views">
          <Tabs.Trigger value="preview" className="tabs__trigger">
            Preview
          </Tabs.Trigger>
          <Tabs.Trigger value="media" className="tabs__trigger">
            Media ({inject.assets.length})
          </Tabs.Trigger>
          <Tabs.Trigger value="versions" className="tabs__trigger">
            Versions ({inject.versions.length})
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="preview" className="tabs__panel">
          <PreviewTab {...props} />
        </Tabs.Content>
        <Tabs.Content value="media" className="tabs__panel">
          <MediaPanel
            projectPath={props.projectPath}
            assets={inject.assets}
            title={injectAlt({ ...draft, mselRowId: inject.mselRowId })}
          />
        </Tabs.Content>
        <Tabs.Content value="versions" className="tabs__panel">
          <VersionsPanel
            inject={inject}
            draft={draft}
            busy={props.busy}
            onRestore={props.onRestore}
          />
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  )
}
