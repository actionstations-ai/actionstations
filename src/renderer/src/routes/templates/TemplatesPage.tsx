import { useSearchParams } from 'react-router'
import type { TemplateInfo } from '@shared/ipc'
import { Badge, EmptyState, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import {
  CATEGORY_LABELS,
  categoriesPresent,
  categoryOf,
  filterTemplates,
  type GalleryCategory,
} from './gallery'
import { TemplateDetail } from './TemplateDetail'
import { TemplatePreview } from './TemplatePreview'
import './templates.css'

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

function TemplateCard(props: { template: TemplateInfo; onOpen: () => void }) {
  const { template } = props
  return (
    <li>
      <button type="button" className="card card--interactive tpl-card" onClick={props.onOpen}>
        <TemplatePreview template={template} scale={0.5} alt="" />
        <span className="tpl-card__title">{template.label}</span>
        <span className="row tpl-badges">
          <Badge>{CATEGORY_LABELS[categoryOf(template.type)]}</Badge>
          {template.paper && <Badge tone="info">Paper</Badge>}
          {template.variants.length > 1 && <Badge>{template.variants.length} variants</Badge>}
        </span>
      </button>
    </li>
  )
}

export default function TemplatesPage() {
  const [params, setParams] = useSearchParams()
  const list = useIpcQuery('templates:list', undefined)
  const templates = list.data ?? []
  const category = (params.get('category') ?? 'all') as GalleryCategory | 'all'
  const selected = templates.find((t) => t.type === params.get('type'))
  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p)
  }
  const shown = filterTemplates(templates, category)

  return (
    <div className="page page--wide templates-page">
      <PageHeader eyebrow="Library" title="Templates" description={DESCRIPTION} />
      {list.error && (
        <p className="field__error" role="alert">
          Could not list templates: {list.error.message}
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
