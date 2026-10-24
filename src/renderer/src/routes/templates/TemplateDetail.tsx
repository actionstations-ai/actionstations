import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import type { TemplateInfo } from '@shared/ipc'
import { Badge, Button } from '../../components/ui'
import { CATEGORY_LABELS, categoryOf, schemaFields, variantsOf } from './gallery'
import { TemplatePreview } from './TemplatePreview'
import { templateNote, templateProvenanceOf } from '../../lib/template-source'
import { ProvenanceBadge } from '../../components/ProvenanceBadge'
import { PackCopyUpdate } from '../../components/PackCopyUpdate'
import { useIpcMutation } from '../../lib/query'

function VariantSwitcher(props: {
  variants: string[]
  value: string
  onChange: (v: string) => void
}) {
  if (props.variants.length < 2) return null
  return (
    <div className="tpl-filter" role="group" aria-label="Variant">
      {props.variants.map((v) => (
        <button
          key={v}
          type="button"
          className="tpl-filter__option"
          aria-pressed={v === props.value}
          onClick={() => props.onChange(v)}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function FieldTable({ template }: { template: TemplateInfo }) {
  const fields = schemaFields(template.schema)
  if (!fields.length) return <p className="muted">This template has no fields.</p>
  return (
    <table className="tpl-fields">
      <caption className="sr-only">Fields of {template.label}</caption>
      <thead>
        <tr>
          <th scope="col">Field</th>
          <th scope="col">Type</th>
          <th scope="col">Description</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => (
          <tr key={f.name}>
            <th scope="row">
              <code>{f.name}</code>
              {f.required && <span className="tpl-fields__req"> required</span>}
            </th>
            <td>{f.options ? `one of ${f.options.join(', ')}` : f.type}</td>
            <td>{f.description ?? <span className="muted">—</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** "Update from pack" for the project's copy of a pack template (#310). */
function TemplateCopyUpdate(props: { template: TemplateInfo; projectPath: string | undefined }) {
  const { template, projectPath } = props
  const update = useIpcMutation('templates:updateFromPack', {
    invalidates: ['templates:list', 'templates:taxonomy'],
  })
  if (!projectPath || template.source !== 'project') return null
  return (
    <PackCopyUpdate
      kind="template"
      name={template.label}
      packName={template.packName ?? template.packId ?? 'the pack'}
      copy={template.copy}
      onUpdate={(confirmEdited) =>
        update.mutateAsync({
          projectPath,
          type: template.type,
          ...(confirmEdited ? { confirmEdited } : {}),
        })
      }
    />
  )
}

export function TemplateDetail(props: {
  template: TemplateInfo
  projectPath?: string | undefined
  onBack: () => void
}) {
  const { template } = props
  const variants = variantsOf(template)
  const [variant, setVariant] = useState(variants[0]!)
  const size = `${template.width} × ${template.height ?? 'auto'} px`
  const provenance = templateProvenanceOf(template)
  const note = templateNote(template)
  return (
    <section className="tpl-detail" aria-label={template.label}>
      <div className="row">
        <Button variant="ghost" size="sm" onClick={props.onBack}>
          <ArrowLeft size={16} aria-hidden /> All templates
        </Button>
      </div>
      <div className="tpl-detail__body">
        <div className="tpl-detail__preview card">
          <VariantSwitcher variants={variants} value={variant} onChange={setVariant} />
          <TemplatePreview
            template={template}
            variant={variant}
            scale={1}
            alt={`${template.label} preview (${variant})`}
          />
        </div>
        <div className="tpl-detail__info">
          <h2>{template.label}</h2>
          <div className="row tpl-badges">
            <Badge>{CATEGORY_LABELS[categoryOf(template.type)]}</Badge>
            {template.paper && <Badge tone="info">Paper · PDF</Badge>}
            <Badge>v{template.version}</Badge>
          </div>
          <dl className="tpl-meta">
            {(provenance || note) && (
              <div>
                <dt>Source</dt>
                <dd>
                  {provenance && <ProvenanceBadge provenance={provenance} />}
                  {provenance && note && ' '}
                  {note}
                  <span className="tpl-copy-update">
                    <TemplateCopyUpdate template={template} projectPath={props.projectPath} />
                  </span>
                </dd>
              </div>
            )}
            <div>
              <dt>Type id</dt>
              <dd>
                <code>{template.type}</code>
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{size}</dd>
            </div>
            <div>
              <dt>Variants</dt>
              <dd>{variants.join(', ')}</dd>
            </div>
          </dl>
          <h3>Fields</h3>
          <FieldTable template={template} />
          <p className="muted tpl-hint">
            Template folder: <code>templates/injects/{template.type}/</code>. Edit the HTML, CSS and
            preview.json there; run <code>pnpm test:templates</code> to check goldens.
          </p>
        </div>
      </div>
    </section>
  )
}
