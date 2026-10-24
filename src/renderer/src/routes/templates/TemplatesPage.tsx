import { useSearchParams } from 'react-router'
import type { TemplateInfo } from '@shared/ipc'
import { Badge, EmptyState, PageHeader } from '../../components/ui'
import { DOMAIN_PROFILES, resolveProfile } from '@shared/domains'
import { useIpcQuery } from '../../lib/query'
import { profileLabel } from '../../lib/domains'
import { templateProvenance } from '../../lib/template-source'
import { useInjectTypes } from '../../state/inject-types'
import { useProjectUi } from '../../state/project'
import {
  CATEGORY_LABELS,
  categoriesPresent,
  categoryOf,
  domainsOf,
  filterTemplates,
  type GalleryCategory,
} from './gallery'
import { TemplateDetail } from './TemplateDetail'
import { TemplatePreview } from './TemplatePreview'
import './templates.css'
import { errorText } from '../../lib/errors'

const DESCRIPTION =
  'Every inject template the app can render, shown with its sample data. Text-bearing injects always come from these templates, so their text is exact.'

function CategoryFilter(props: {
  categories: GalleryCategory[]
  value: GalleryCategory | 'all'
  onChange: (c: GalleryCategory | 'all') => void
}) {
  const options: (GalleryCategory | 'all')[] = ['all', ...props.categories]
  return (
    <div className="tpl-filter" role="group" aria-label="Category">
      {options.map((c) => (
        <button
          key={c}
          type="button"
          className="tpl-filter__option"
          aria-pressed={c === props.value}
          onClick={() => props.onChange(c)}
        >
          {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
        </button>
      ))}
    </div>
  )
}

function DomainFilter(props: {
  value: string
  projectDomain: string | undefined
  onChange: (d: string) => void
}) {
  const options = ['all', ...DOMAIN_PROFILES.map((p) => p.id)]
  return (
    <div className="stack tpl-domain">
      <div className="tpl-filter" role="group" aria-label="Domain">
        {options.map((d) => (
          <button
            key={d}
            type="button"
            className="tpl-filter__option"
            aria-pressed={d === props.value}
            onClick={() => props.onChange(d)}
          >
            {d === 'all' ? 'All domains' : profileLabel(d)}
            {d === props.projectDomain && <span className="sr-only"> (this project)</span>}
          </button>
        ))}
      </div>
      {props.value !== 'all' && (
        <p className="muted tpl-domain__note">
          Showing templates a {profileLabel(props.value)} project can use: every general template
          plus those made for this domain.
        </p>
      )}
    </div>
  )
}

/** The open project's domain profile id, when a project is open. */
function useProjectDomain(): string | undefined {
  const projectPath = useProjectUi((s) => s.projectPath)
  const project = useIpcQuery(
    'project:get',
    { path: projectPath ?? '' },
    { enabled: !!projectPath },
  )
  const p = project.data?.project
  return p
    ? resolveProfile(p.orgType, p.domainProfileOverrides, p.domainProfileSnapshot).id
    : undefined
}

function TemplateCard(props: { template: TemplateInfo; onOpen: () => void }) {
  const { template } = props
  // Plain text provenance for pack, user and project templates (badges: #269).
  const source = templateProvenance(template)
  return (
    <li>
      <button type="button" className="card card--interactive tpl-card" onClick={props.onOpen}>
        <TemplatePreview template={template} scale={0.5} alt="" />
        <span className="tpl-card__title">{template.label}</span>
        {source && <span className="muted tpl-card__source">{source}</span>}
        <span className="row tpl-badges">
          <Badge>{CATEGORY_LABELS[categoryOf(template.type)]}</Badge>
          {template.paper && <Badge tone="info">Paper</Badge>}
          {domainsOf(template.type).length > 0 && (
            <Badge tone="warn">{domainsOf(template.type).map(profileLabel).join(', ')} only</Badge>
          )}
          {template.variants.length > 1 && <Badge>{template.variants.length} variants</Badge>}
        </span>
      </button>
    </li>
  )
}

export default function TemplatesPage() {
  const [params, setParams] = useSearchParams()
  const projectPath = useProjectUi((s) => s.projectPath)
  // With a project open, its own templates (and copies of pack templates) are listed too.
  const list = useIpcQuery('templates:list', projectPath ? { projectPath } : undefined)
  useInjectTypes() // categories and domain tags of pack types come from the registry
  const templates = list.data ?? []
  const category = (params.get('category') ?? 'all') as GalleryCategory | 'all'
  const projectDomain = useProjectDomain()
  const domain = params.get('domain') ?? projectDomain ?? 'all'
  const selected = templates.find((t) => t.type === params.get('type'))
  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p)
  }
  const shown = filterTemplates(templates, category, domain)

  return (
    <div className="page page--wide templates-page">
      <PageHeader eyebrow="Library" title="Templates" description={DESCRIPTION} />
      {list.error && (
        <p className="field__error" role="alert">
          Could not list templates: {errorText(list.error)}
        </p>
      )}
      {list.isSuccess && templates.length === 0 && (
        <EmptyState
          title="No templates installed"
          body="Inject templates live in the app's templates/injects/ folder. None were found."
        />
      )}
      {selected ? (
        <TemplateDetail
          key={selected.type}
          template={selected}
          onBack={() => update({ type: null })}
        />
      ) : (
        templates.length > 0 && (
          <>
            <DomainFilter
              value={domain}
              projectDomain={projectDomain}
              onChange={(d) => update({ domain: d })}
            />
            <CategoryFilter
              categories={categoriesPresent(templates)}
              value={category}
              onChange={(c) => update({ category: c === 'all' ? null : c })}
            />
            <ul className="tpl-grid" aria-label={`${shown.length} templates`}>
              {shown.map((t) => (
                <TemplateCard key={t.type} template={t} onOpen={() => update({ type: t.type })} />
              ))}
            </ul>
          </>
        )
      )}
    </div>
  )
}
