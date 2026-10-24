import type { TemplateInfo } from '@shared/ipc'
import { useIpcQuery } from '../../lib/query'
import { errorText } from '../../lib/errors'
import { useProjectUi } from '../../state/project'

/** A template's preview.json rendered by the main-process renderer (render:preview). */
export function TemplatePreview(props: {
  template: TemplateInfo
  variant?: string
  scale: number
  alt: string
}) {
  const { template, variant, scale } = props
  // A project template renders from the project's layer (main needs the project for that).
  const projectPath = useProjectUi((s) => s.projectPath)
  const scope = template.source === 'project' && projectPath ? { projectPath } : {}
  const preview = useIpcQuery(
    'render:preview',
    {
      type: template.type,
      fields: (variant && template.previewVariants?.[variant]) || template.preview,
      scale,
      ...(variant ? { variant } : {}),
      ...scope,
    },
    { staleTime: Infinity },
  )
  const ratio = `${template.width} / ${template.height ?? Math.round(template.width * 0.75)}`
  if (preview.error)
    return (
      <div className="tpl-preview tpl-preview--error" style={{ aspectRatio: ratio }} role="alert">
        Preview failed: {errorText(preview.error)}
      </div>
    )
  if (!preview.data)
    return (
      <div className="tpl-preview tpl-preview--loading" style={{ aspectRatio: ratio }}>
        <span className="muted">Rendering…</span>
      </div>
    )
  return (
    <img
      className="tpl-preview"
      src={preview.data.dataUrl}
      alt={props.alt}
      width={preview.data.width}
      height={preview.data.height}
    />
  )
}
