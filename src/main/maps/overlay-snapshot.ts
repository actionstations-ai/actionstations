// A picture of a geographic map (#652): its overlays (warning areas, tracks, rasters, place
// outlines) and the numbered places the audience may see, drawn on a plain frame with a legend.
// There is no street map in the picture; every label is exact text. The picture is an HTML page
// with an inline SVG, rendered to PNG by the same window pool as the inject images.
import type { Pin } from '@shared/maps/pins'
import { isPercentPosition } from '@shared/maps/pins'
import {
  escapeXml,
  legendHtml,
  mapFigure,
  overlayLayersFor,
  type FigureMarker,
  type MapFigure,
} from '@shared/maps/overlays'
import type { ProjectMaps } from '@shared/schemas'
import { RENDER_CSP, type ComposedDocument } from '../render/compose'
import { sharedDir } from '../render/templates'

export const MAX_GEO_MARKERS = 12
const PAGE_WIDTH = 1000

const KIND: Record<Pin['kind'], FigureMarker['kind']> = {
  incident: 'incident',
  staging: 'staging',
  command: 'command',
  asset: 'info',
  public: 'info',
  other: 'info',
}

/** Numbered markers for the pins that sit on a geographic map, in pin order. */
export function geoMarkers(pins: Pin[]): (FigureMarker & { rows: string })[] {
  return pins
    .flatMap((pin) =>
      isPercentPosition(pin.position)
        ? []
        : [
            {
              lat: pin.position.lat,
              lon: pin.position.lon,
              label: pin.label,
              kind: KIND[pin.kind],
              rows: pin.rows.map((r) => r.rowId).join(', '),
            },
          ],
    )
    .slice(0, MAX_GEO_MARKERS)
    .map((m, i) => ({ ...m, n: i + 1 }))
}

export interface GeoFigureRequest {
  title: string
  maps: ProjectMaps
  mapId: string
  pins: Pin[]
  /** ISO time to show; absent shows every overlay. */
  at?: string | undefined
}

/** The figure for a geographic map: overlays, place outlines and numbered places. */
export function geoFigure(req: GeoFigureRequest): {
  fig: MapFigure
  markers: ReturnType<typeof geoMarkers>
} {
  const markers = geoMarkers(req.pins)
  const at = req.at ? Date.parse(req.at) : null
  const fig = mapFigure({
    title: req.title,
    layers: overlayLayersFor(req.maps, req.mapId),
    markers,
    at: at !== null && !Number.isNaN(at) ? at : null,
    width: PAGE_WIDTH - 40,
  })
  return { fig, markers }
}

const STYLE = `
body{margin:0;background:#fff;color:#1c232b;font:14px/1.4 'Public Sans',Arial,sans-serif}
main{padding:20px}
h1{font-size:22px;margin:0 0 4px}
p.sum{margin:0 0 12px;color:#3d4650}
.mapfig-legend{display:flex;flex-wrap:wrap;gap:8px 28px;margin-top:12px}
.mapfig-legend ul{list-style:none;margin:2px 0 0;padding:0}
.mapfig-legend li{display:flex;align-items:center;gap:6px}
.muted{color:#5b6470}
ol.places{margin:12px 0 0;padding-left:24px}
.note{margin-top:10px;color:#5b6470;font-size:12px}
`

/** The page the PNG is made from. Text is escaped; the SVG and legend come from our own drawing code. */
export function geoFigureDocument(
  title: string,
  fig: MapFigure,
  markers: ReturnType<typeof geoMarkers>,
): ComposedDocument {
  const places = markers.length
    ? `<ol class="places">${markers
        .map(
          (m) =>
            `<li value="${m.n}"><b>${escapeXml(m.label)}</b>${m.rows ? ` <span class="muted">${escapeXml(m.rows)}</span>` : ''}</li>`,
        )
        .join('')}</ol>`
    : ''
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${escapeXml(title)}</title>
<meta http-equiv="Content-Security-Policy" content="${RENDER_CSP}">
<style>${STYLE}</style></head>
<body><main class="inject-root" style="width:${PAGE_WIDTH - 40}px">
<h1>${escapeXml(title)}</h1><p class="sum">${escapeXml(fig.summary)}</p>
${fig.svg}
<div class="mapfig-legend">${legendHtml(fig.legend)}</div>${places}
<p class="note">Positions only. This picture has no street map.</p>
</main></body></html>`
  const dir = sharedDir()
  return {
    html,
    meta: { width: PAGE_WIDTH } as ComposedDocument['meta'],
    baseDir: dir,
    readRoots: [dir],
  }
}
