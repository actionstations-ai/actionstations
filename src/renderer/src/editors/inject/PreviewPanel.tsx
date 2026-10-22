// Live preview of the draft through render:preview: debounced while typing, rendered at 1×
// for speed, with a crisp 2× render on demand. Image slots show the inject's own AI images
// (render:preview reads them by injectId) and the template's sample images where it has none.
import { useEffect, useRef, useState } from 'react'
import type { TemplateInfo } from '@shared/ipc'
import { Button } from '../../components/ui'
import { call } from '../../lib/api'
import { stableJson } from './draft'

const DEBOUNCE_MS = 300

interface PreviewImage {
  dataUrl: string
  width: number
  height: number
  scale: number
}

export interface PreviewRequest {
  type: string
  fields: Record<string, unknown>
  variant?: string
  projectPath: string
  scenarioId: string
  injectId?: string
}

/** Render `req` after it has been stable for DEBOUNCE_MS; newer requests win. */
function usePreview(req: PreviewRequest | null, scale: number, refreshKey: string) {
  const [image, setImage] = useState<PreviewImage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const key = req ? `${stableJson(req)}@${scale}#${refreshKey}` : ''
  const latest = useRef(req)
  useEffect(() => {
    latest.current = req
  })
  useEffect(() => {
    const current = latest.current
    if (!current) return
    const mine = ++seq.current
    const timer = setTimeout(() => {
      setBusy(true)
      call('render:preview', { ...current, scale })
        .then((r) => {
          if (seq.current !== mine) return
          setImage({ ...r, scale })
          setError(null)
        })
        .catch((e: Error) => {
          if (seq.current === mine) setError(e.message)
        })
        .finally(() => {
          if (seq.current === mine) setBusy(false)
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [key, scale])
  return { image, error, busy }
}

export function PreviewPanel(props: {
  template: TemplateInfo | undefined
  request: PreviewRequest | null
  alt: string
  /** Changes when the inject's images change, so the preview picks up new AI images. */
  refreshKey?: string
}) {
  const [crisp, setCrisp] = useState(false)
  const { image, error, busy } = usePreview(
    props.template ? props.request : null,
    crisp ? 2 : 1,
    props.refreshKey ?? '',
  )
  if (!props.template)
    return (
      <p className="muted">
        This inject type has no template, so there is nothing to preview. Its media comes from the
        AI image or voice paths (see the Media tab).
      </p>
    )
  const t = props.template
  const ratio = `${t.width} / ${t.height ?? Math.round(t.width * 0.75)}`
  return (
    <div className="inject-preview">
      <div className="inject-preview__bar">
        <span className="muted" aria-live="polite">
          {busy ? 'Rendering…' : image ? `${image.scale}× · ${t.width} px wide` : ''}
        </span>
        <Button size="sm" aria-pressed={crisp} onClick={() => setCrisp((c) => !c)}>
          {crisp ? 'Fast 1× preview' : 'Crisp 2× preview'}
        </Button>
      </div>
      {error && (
        <p className="field__error" role="alert">
          Preview failed: {error}
        </p>
      )}
      {image ? (
        <div className="inject-preview__frame">
          <img
            src={image.dataUrl}
            alt={props.alt}
            width={image.width}
            height={image.height}
            className={busy ? 'is-stale' : undefined}
          />
        </div>
      ) : (
        <div
          className="inject-preview__frame inject-preview__frame--empty"
          style={{ aspectRatio: ratio }}
        >
          <span className="muted">Rendering…</span>
        </div>
      )}
      {t.paper && <p className="muted">Paper template: Render also writes a PDF page.</p>}
    </div>
  )
}
