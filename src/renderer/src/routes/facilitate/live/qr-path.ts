// The SVG path of a QR module matrix (spec 0407 FR-3): one `M x y h<run> v1 h-<run> z` per
// horizontal run of dark modules, inside a four-module quiet zone.
import type { QrMatrix } from '@shared/schemas/live'

export const QUIET_ZONE = 4

export function qrPath(qr: QrMatrix): string {
  const parts: string[] = []
  qr.rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (row[x] !== '1') {
        x++
        continue
      }
      let run = 1
      while (row[x + run] === '1') run++
      parts.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h${run}v1h-${run}z`)
      x += run
    }
  })
  return parts.join('')
}
