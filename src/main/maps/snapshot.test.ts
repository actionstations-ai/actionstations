// maps:snapshot (#500): markers come only from percent positions, and the same pins give the
// same file name. The drawing itself is checked in e2e/maps.spec.ts.
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import type { Pin } from '@shared/maps/pins'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.0', getPath: () => tmpdir(), isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}))

const { snapshotMarkers, snapshotName } = await import('./snapshot')

const pin = (placeId: string, position: Pin['position']): Pin => ({
  placeId,
  label: placeId,
  kind: 'incident',
  position,
  rows: [{ rowId: 'I-01', status: 'delivered' }],
  status: 'delivered',
})

describe('snapshotMarkers', () => {
  it('keeps site plan pins and skips latitude and longitude pins', () => {
    const out = snapshotMarkers([
      pin('gate', { mapId: 'm', x: 20, y: 30 }),
      pin('far', { mapId: 'm', lat: 40, lon: -80 }),
    ])
    expect(out).toEqual([{ x: 20, y: 30, label: 'gate', detail: 'I-01', kind: 'incident' }])
  })
})

describe('snapshotName', () => {
  it('is stable for the same input and differs when a marker moves', () => {
    expect(snapshotName({ a: 1 })).toBe(snapshotName({ a: 1 }))
    expect(snapshotName({ a: 1 })).not.toBe(snapshotName({ a: 2 }))
    expect(snapshotName({ a: 1 })).toMatch(/^[0-9a-f]{24}\.png$/)
  })
})
