// A QR code drawn from the module matrix main computed (spec 0407 FR-3, NFR-3): one SVG path,
// crisp at any size, black on white whatever the theme so phone cameras read it, with the URL
// as its text alternative.
import type { QrMatrix } from '@shared/schemas/live'
import { QUIET_ZONE, qrPath } from './qr-path'

export function QrCode(props: { qr: QrMatrix; label: string; size?: number }) {
  const side = props.qr.size + QUIET_ZONE * 2
  const px = props.size ?? 240
  return (
    <svg
      className="live-qr"
      role="img"
      aria-label={props.label}
      viewBox={`0 0 ${side} ${side}`}
      width={px}
      height={px}
      shapeRendering="crispEdges"
    >
      <rect width={side} height={side} fill="#ffffff" />
      <path d={qrPath(props.qr)} fill="#000000" />
    </svg>
  )
}
