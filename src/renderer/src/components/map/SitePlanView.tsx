// Site plan engine (#436, FR-2/FR-7): the plan image with markers placed by percent. Pan by
// dragging or with the arrow keys, zoom with the wheel, the buttons or + and -. It uses no
// WebGL, so it works on any computer. Large plans are drawn from a tile pyramid
// (PlaneImage); small ones are one image.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { MapLayer } from '@shared/schemas'
import { isPercentPosition, type PinStatus } from '@shared/maps/pins'
import { Button } from '../ui'
import { PlaneImage } from './PlaneImage'
import { markerName, type MapMarker } from './marker-model'
import { MarkerButton } from './markers'

type Plan = Extract<MapLayer, { kind: 'site_plan' }>
interface View {
  x: number
  y: number
  scale: number
}
const MIN = 1
const MAX = 8
const FIT: View = { x: 0, y: 0, scale: 1 }

export interface MapEngineProps {
  projectPath: string
  markers: MapMarker[]
  rowStatus: Record<string, PinStatus>
  selectedRowId?: string | undefined
  selectedMarkerId?: string | undefined
  onActivate: (m: MapMarker) => void
  /** Editor: a click on empty map. Plans give percent, geographic maps give lat/lon. */
  onPick?: ((p: { x: number; y: number } | { lat: number; lon: number }) => void) | undefined
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Zoom by `factor`, keeping the point (cx, cy) of the frame where it is. */
function zoomAt(v: View, factor: number, cx: number, cy: number): View {
  const scale = clamp(v.scale * factor, MIN, MAX)
  const k = scale / v.scale
  return { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
}

/** Keep the plan covering the frame: no panning past its edges. */
function limit(v: View, w: number, h: number): View {
  return {
    scale: v.scale,
    x: clamp(v.x, w - w * v.scale, 0),
    y: clamp(v.y, h - h * v.scale, 0),
  }
}

export function SitePlanView(props: MapEngineProps & { layer: Plan }) {
  const { layer, markers } = props
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ px: number; py: number; moved: boolean } | null>(null)
  const [view, setView] = useState<View>(FIT)
  const [frameSize, setFrameSize] = useState({ w: 1000, h: 1000 })
  useEffect(() => {
    const el = frame.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setFrameSize({ w: r.width, h: r.height })
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [])
  const size = () => {
    const r = frame.current?.getBoundingClientRect()
    return { w: r?.width ?? 1000, h: r?.height ?? 1000 }
  }
  const apply = useCallback((next: (v: View) => View) => {
    const { w, h } = size()
    setView((v) => limit(next(v), w, h))
  }, [])
  const zoom = (factor: number) => {
    const { w, h } = size()
    apply((v) => zoomAt(v, factor, w / 2, h / 2))
  }

  const onWheel = (e: React.WheelEvent) => {
    const r = frame.current?.getBoundingClientRect()
    if (!r) return
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15
    apply((v) => zoomAt(v, f, e.clientX - r.left, e.clientY - r.top))
  }
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { px: e.clientX, py: e.clientY, moved: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.px
    const dy = e.clientY - d.py
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (!d.moved) return
    d.px = e.clientX
    d.py = e.clientY
    apply((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.moved || !props.onPick) return
    const img = (e.currentTarget as HTMLElement).querySelector('img')?.getBoundingClientRect()
    if (!img) return
    const x = ((e.clientX - img.left) / img.width) * 100
    const y = ((e.clientY - img.top) / img.height) * 100
    if (x >= 0 && x <= 100 && y >= 0 && y <= 100)
      props.onPick({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = 40
    const move: Record<string, [number, number]> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    }
    const m = move[e.key]
    if (m) {
      e.preventDefault()
      apply((v) => ({ ...v, x: v.x + m[0], y: v.y + m[1] }))
    } else if (e.key === '+' || e.key === '=') zoom(1.25)
    else if (e.key === '-') zoom(1 / 1.25)
    else if (e.key === '0') setView(FIT)
  }

  const placed = markers.filter((m) => isPercentPosition(m.position))
  return (
    <div className="map-engine">
      <div className="map-toolbar" role="group" aria-label="Map controls">
        <Button size="sm" onClick={() => zoom(1.25)} aria-label="Zoom in">
          <ZoomIn size={14} aria-hidden />
        </Button>
        <Button size="sm" onClick={() => zoom(1 / 1.25)} aria-label="Zoom out">
          <ZoomOut size={14} aria-hidden />
        </Button>
        <Button size="sm" onClick={() => setView(FIT)} aria-label="Fit the whole plan">
          <Maximize2 size={14} aria-hidden />
        </Button>
      </div>
      <div
        ref={frame}
        className="map-frame"
        role="group"
        aria-label={`Site plan: ${layer.title}. Arrow keys move, plus and minus zoom.`}
        tabIndex={0}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        data-testid="site-plan"
        style={{ aspectRatio: `${layer.width} / ${layer.height}` }}
      >
        <div
          className="map-plane"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            ['--map-inv-scale' as string]: String(1 / view.scale),
          }}
        >
          <PlaneImage projectPath={props.projectPath} layer={layer} frame={frameSize} view={view} />
          {placed.map((m) => (
            <MarkerButton
              key={m.id}
              marker={m}
              name={markerName(m, props.rowStatus)}
              selected={
                m.id === props.selectedMarkerId ||
                (!!props.selectedRowId && m.rowIds.includes(props.selectedRowId))
              }
              onActivate={props.onActivate}
              style={
                isPercentPosition(m.position)
                  ? { left: `${m.position.x}%`, top: `${m.position.y}%` }
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}
