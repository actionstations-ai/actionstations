// The picture inside a site plan's plane (#500): the plan as one image, or for a large plan the
// tiles of its pyramid, built on first use. A small plan never asks for a pyramid.
import { PYRAMID_MIN_SIDE } from '@shared/maps/pyramid'
import { mediaUrl } from '@shared/media-url'
import type { MapLayer } from '@shared/schemas'
import { useIpcQuery } from '../../lib/query'
import { PlanTiles } from './PlanTiles'
import type { ViewState } from './plan-tiles'
import './plan-tiles.css'

type Plan = Extract<MapLayer, { kind: 'site_plan' }>

interface Props {
  projectPath: string
  layer: Plan
  frame: { w: number; h: number }
  view: ViewState
}

function WholeImage({ projectPath, layer }: Pick<Props, 'projectPath' | 'layer'>) {
  return (
    <img
      className="map-plane__img"
      src={mediaUrl(projectPath, layer.image)}
      alt=""
      draggable={false}
      width={layer.width}
      height={layer.height}
    />
  )
}

function LargePlan(props: Props) {
  const pyramid = useIpcQuery(
    'maps:plan-pyramid',
    { projectPath: props.projectPath, mapId: props.layer.id },
    { staleTime: Infinity },
  )
  if (pyramid.data)
    return (
      <PlanTiles
        projectPath={props.projectPath}
        pyramid={pyramid.data}
        frame={props.frame}
        view={props.view}
      />
    )
  if (pyramid.isPending)
    return (
      <p className="map-plane__note" role="status">
        Preparing the plan…
      </p>
    )
  return <WholeImage projectPath={props.projectPath} layer={props.layer} />
}

export function PlaneImage(props: Props) {
  const large = Math.max(props.layer.width, props.layer.height) > PYRAMID_MIN_SIDE
  return large ? <LargePlan {...props} /> : <WholeImage {...props} />
}
