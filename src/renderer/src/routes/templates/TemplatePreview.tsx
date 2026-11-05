import { useQuery } from '@tanstack/react-query'
import type { ChannelResponse, TemplateInfo } from '@shared/ipc'
import { call, type IpcError } from '../../lib/api'
import { errorText } from '../../lib/errors'
import { useInView } from '../../lib/use-in-view'
import { useProjectUi } from '../../state/project'
import { galleryRenders } from './render-queue'

/** Start a gallery render a little before its card scrolls into view. */
const LAZY_MARGIN = '200px'

type Preview = ChannelResponse<'render:preview'>

/**
 * A template's preview.json rendered by the main-process renderer (render:preview).
 * `lazy` (gallery cards): render only once the card is on screen, through a shared queue that
 * limits how many renders run at once (#1070). Until then a placeholder of the preview's size
 * holds the layout still.
 */
export function TemplatePreview(props: {
  template: TemplateInfo
  variant?: string
  scale: number
  alt: string
  lazy?: boolean
}) {
  const { template, variant, scale, lazy = false } = props
  // A project template renders from the project's layer (main needs the project for that).
  const projectPath = useProjectUi((s) => s.projectPath)
  const scope = template.source === 'project' && projectPath ? { projectPath } : {}
  const req = {
    type: template.type,
    fields: (variant && template.previewVariants?.[variant]) || template.preview,
    scale,
    ...(variant ? { variant } : {}),
    ...scope,
  }
  const { ref: watchRef, seen, isVisible } = useInView(LAZY_MARGIN)
  const preview = useQuery<Preview, IpcError>({
    queryKey: ['render:preview', req],
    queryFn: ({ signal }) =>
      lazy
        ? galleryRenders.run(() => call('render:preview', req), {
            signal,
            isVisible,
          })
        : call('render:preview', req),
    enabled: !lazy || seen,
    staleTime: Infinity,
  })
  const ratio = `${template.width} / ${template.height ?? Math.round(template.width * 0.75)}`
  // On a card the preview is decorative (the card's text names it): keep status text out of
  // the button's accessible name.
  const decorative = props.alt === ''
  if (preview.error)
    return (
      <div className="tpl-preview tpl-preview--error" style={{ aspectRatio: ratio }} role="alert">
        Preview failed: {errorText(preview.error)}
      </div>
    )
  if (!preview.data)
    return (
      <div
        ref={watchRef}
        className="tpl-preview tpl-preview--loading"
        style={{ aspectRatio: ratio }}
        aria-hidden={decorative || undefined}
      >
        {preview.fetchStatus === 'fetching' && <span className="muted">Rendering…</span>}
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
