// The inject's media files: template renders, AI images (with the slot they fill), voice and
// video, each with its provenance (provider, model, seed, prompt).
import type { MediaAsset } from '@shared/schemas/media'
import { mediaUrl } from '@shared/media-url'
import { Badge } from '../../components/ui'
import { slotOfAsset } from './media-utils'

const ROLE_LABEL: Record<MediaAsset['role'], string> = {
  rendered: 'Template render',
  composite: 'Template render with AI image',
  generated: 'AI generated',
  source: 'Source file',
}

function Provenance({ asset }: { asset: MediaAsset }) {
  const p = asset.provenance
  const rows: [string, string | undefined][] = [
    ['Provider', p.provider],
    ['Model', p.model],
    ['Template', p.templateId ? `${p.templateId} v${p.templateVersion ?? '?'}` : undefined],
    ['Seed', p.seed !== undefined ? String(p.seed) : undefined],
    ['Prompt', p.prompt],
    ['Negative prompt', p.negativePrompt],
    ['Post FX', p.postFx?.join(', ')],
    ['Workflow', p.workflowHash?.slice(0, 12)],
    ['Created', new Date(p.createdAt).toLocaleString()],
    ['File', asset.path],
  ]
  return (
    <details className="asset__details">
      <summary>Provenance</summary>
      <dl className="asset__prov">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className={k === 'File' || k === 'Workflow' ? 'mono' : undefined}>{v}</dd>
            </div>
          ))}
      </dl>
    </details>
  )
}

function AssetMedia({ asset, url, title }: { asset: MediaAsset; url: string; title: string }) {
  if (asset.kind === 'image')
    return (
      <img src={url} alt={`${title}: ${ROLE_LABEL[asset.role].toLowerCase()}`} loading="lazy" />
    )
  if (asset.kind === 'audio')
    return (
      <audio controls preload="metadata" src={url} aria-label={`${title}: audio`}>
        <track kind="captions" />
      </audio>
    )
  if (asset.kind === 'video')
    return (
      <video controls preload="metadata" src={url} aria-label={`${title}: video`}>
        <track kind="captions" />
      </video>
    )
  return <p className="muted">PDF page · {asset.path.split('/').pop()}</p>
}

export function MediaPanel(props: { projectPath: string; assets: MediaAsset[]; title: string }) {
  if (!props.assets.length)
    return (
      <p className="muted">
        No media yet. Render the template (Cmd/Ctrl+Enter) or regenerate media to create it.
      </p>
    )
  return (
    <ul className="asset-list" aria-label="Media files">
      {props.assets.map((a) => {
        const slot = a.role === 'generated' && a.kind === 'image' ? slotOfAsset(a.id) : undefined
        return (
          <li key={a.id} className="asset card">
            <div className="asset__head">
              <Badge tone={a.role === 'generated' ? 'info' : 'neutral'}>{ROLE_LABEL[a.role]}</Badge>
              <span className="muted">
                {a.kind}
                {a.width && a.height ? ` · ${a.width}×${a.height}` : ''}
                {a.durationSec ? ` · ${a.durationSec.toFixed(1)} s` : ''}
                {slot ? ` · fills slot “${slot}”` : ''}
              </span>
            </div>
            <div className={`asset__media asset__media--${a.kind}`}>
              <AssetMedia asset={a} url={mediaUrl(props.projectPath, a.path)} title={props.title} />
            </div>
            <Provenance asset={a} />
          </li>
        )
      })}
    </ul>
  )
}
