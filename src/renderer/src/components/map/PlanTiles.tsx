// The tiles of a large plan's pyramid in view (#500). The plane around them pans and zooms by
// CSS transform; this picks the level and the tiles that fit, as plain images over a small base.
import { mediaUrl } from '@shared/media-url'
import { tilePath, visibleTiles, type PyramidView, type ViewState } from './plan-tiles'
import './plan-tiles.css'

export function PlanTiles(props: {
  projectPath: string
  pyramid: PyramidView & { base: string }
  frame: { w: number; h: number }
  view: ViewState
}) {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const tiles = visibleTiles(props.pyramid, props.frame, props.view, dpr)
  return (
    <>
      {tiles.map((t) => (
        <img
          key={`${t.level}/${t.x}_${t.y}`}
          className="plan-tile"
          src={mediaUrl(props.projectPath, tilePath(props.pyramid.base, t))}
          alt=""
          draggable={false}
          style={{ left: `${t.left}%`, top: `${t.top}%`, width: `${t.w}%`, height: `${t.h}%` }}
        />
      ))}
    </>
  )
}
