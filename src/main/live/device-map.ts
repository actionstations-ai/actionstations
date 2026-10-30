/**
 * The map on devices (#500, spec 0436 FR-8). The facilitator picks one map; each seated device
 * gets a `map.state` addressed to it alone, holding only the places of rows that were released to
 * that device's seat and not withdrawn. Servers deliver role and team frames to every device, so
 * a frame per device is what keeps one role's places off another role's phone. A site plan travels
 * as a blob sealed under the players key, once; later messages carry only pins. Rows that have not
 * been released are never read.
 */
import type { BlobRef, MapStatePayload } from '@shared/live/schemas'
import { isPercentPosition, pinsFor, type Pin } from '@shared/maps/pins'
import type { MapLayer, Place } from '@shared/schemas'
import type { ReleaseSummary } from '@shared/schemas/live'
import { seatDestinations, type DeliverySeat } from './releases'

export const MAX_DEVICE_PINS = 40

type WirePin = MapStatePayload['pins'][number]
type ReleaseLike = Pick<ReleaseSummary, 'rowId' | 'targets' | 'withdrawn'>
type To = `client:${string}`

const KIND: Record<Place['kind'], WirePin['kind']> = {
  incident: 'incident',
  staging: 'staging',
  command: 'command',
  asset: 'info',
  public: 'info',
  other: 'info',
}

/** One device: where its message goes and which release targets reach it. */
export interface Audience {
  to: To
  reachedBy: ReadonlySet<string>
}

/** The audience of a seated device; SimCell helpers get no map. */
export function audienceOf(seat: DeliverySeat): Audience | undefined {
  if (seat.kind === 'simcell') return undefined
  return { to: `client:${seat.clientId}`, reachedBy: seatDestinations(seat) }
}

/** Row ids with a release, not withdrawn, whose targets reach the audience. */
export function rowsReaching(releases: readonly ReleaseLike[], audience: Audience): Set<string> {
  const rows = new Set<string>()
  for (const r of releases) {
    if (!r.withdrawn && r.targets.some((t) => audience.reachedBy.has(t))) rows.add(r.rowId)
  }
  return rows
}

function toWirePin(pin: Pin): WirePin {
  const at = pin.position
  return {
    label: pin.label.slice(0, 120),
    detail: pin.rows
      .map((r) => r.rowId)
      .join(', ')
      .slice(0, 200),
    kind: KIND[pin.kind],
    ...(isPercentPosition(at) ? { x: at.x, y: at.y } : { lat: at.lat, lon: at.lon }),
  }
}

export interface DeviceMapInput {
  layer: MapLayer
  places: Place[]
  msel: { id: string; time: string; placeIds?: string[] | undefined }[]
  audience: Audience
  releases: readonly ReleaseLike[]
  image?: BlobRef | undefined
}

/** The `map.state` payload for one device. */
export function deviceMapPayload(i: DeviceMapInput): MapStatePayload {
  const reached = rowsReaching(i.releases, i.audience)
  const pins = pinsFor({
    rows: i.msel.map((r) => ({ id: r.id, time: r.time, placeIds: r.placeIds })),
    delivered: Object.fromEntries([...reached].map((id) => [id, true])),
    elapsedMin: -1,
    places: i.places,
    mapId: i.layer.id,
    audience: 'device',
  })
    .slice(0, MAX_DEVICE_PINS)
    .map(toWirePin)
  const plan = i.layer.kind === 'site_plan'
  const title = i.layer.title.slice(0, 100)
  return {
    mapId: i.layer.id,
    title: i.layer.title.slice(0, 120),
    mapKind: plan ? 'site_plan' : 'geo',
    ...(plan && i.image ? { image: i.image } : {}),
    alt: plan
      ? `Site plan ${title} with ${pins.length} place${pins.length === 1 ? '' : 's'}`
      : `Places on ${title}`,
    pins,
    targets: [i.audience.to],
  }
}

/** The payload that tells a device the map is no longer shared. */
export const closedPayload = (mapId: string, title: string, to: To): MapStatePayload => ({
  mapId,
  title: title.slice(0, 120),
  mapKind: 'site_plan',
  pins: [],
  closed: true,
  targets: [to],
})

export interface DeviceMapSource {
  layers: MapLayer[]
  places: Place[]
  msel: DeviceMapInput['msel']
}

export interface DeviceMapDeps {
  source: () => Promise<DeviceMapSource>
  releases: () => Promise<ReleaseSummary[]>
  /** The devices seated now. */
  seats: () => DeliverySeat[]
  /** Upload a site plan's picture; undefined when it is too large to send. */
  image: (layer: Extract<MapLayer, { kind: 'site_plan' }>) => Promise<BlobRef | undefined>
  send: (to: To, payload: MapStatePayload) => Promise<unknown>
}

/**
 * Shares one map with devices and keeps it current. A device is sent a message only when its
 * payload changed since the last one, so a release that adds no place for a seat sends it
 * nothing, and a device that joins later gets its first message on the next refresh.
 */
export class DeviceMap {
  private shared: { mapId: string; title: string } | undefined
  private readonly last = new Map<To, string>()

  constructor(private readonly deps: DeviceMapDeps) {}

  get mapId(): string | undefined {
    return this.shared?.mapId
  }

  /** Start sharing `mapId`, or stop with undefined. */
  async share(mapId: string | undefined): Promise<void> {
    if (this.shared && this.shared.mapId !== mapId) await this.close()
    if (!mapId) return
    const source = await this.deps.source()
    const layer = source.layers.find((l) => l.id === mapId)
    if (!layer) throw new Error('That map is gone')
    this.shared = { mapId, title: layer.title }
    await this.refresh()
  }

  private async close(): Promise<void> {
    const shared = this.shared
    this.shared = undefined
    if (!shared) return
    for (const to of [...this.last.keys()]) {
      await this.deps.send(to, closedPayload(shared.mapId, shared.title, to))
    }
    this.last.clear()
  }

  /** Send every device whose places changed since its last message. */
  async refresh(): Promise<void> {
    const shared = this.shared
    if (!shared) return
    const source = await this.deps.source()
    const layer = source.layers.find((l) => l.id === shared.mapId)
    if (!layer) return
    const [releases, image] = await Promise.all([
      this.deps.releases(),
      layer.kind === 'site_plan' ? this.deps.image(layer) : undefined,
    ])
    const audiences = this.deps
      .seats()
      .map(audienceOf)
      .filter((a): a is Audience => a !== undefined)
    this.forget(audiences)
    for (const audience of audiences) {
      const payload = deviceMapPayload({
        layer,
        places: source.places,
        msel: source.msel,
        audience,
        releases,
        image,
      })
      const key = JSON.stringify(payload)
      if (this.last.get(audience.to) === key) continue
      this.last.set(audience.to, key)
      await this.deps.send(audience.to, payload)
    }
  }

  /** Drop the record of devices that are no longer seated. */
  private forget(audiences: readonly Audience[]): void {
    const present = new Set(audiences.map((a) => a.to))
    for (const to of [...this.last.keys()]) if (!present.has(to)) this.last.delete(to)
  }
}
