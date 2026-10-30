// The asmap:// protocol for MapLibre (#436, Design §4). The renderer never fetches http(s):
// every tile, style, glyph and sprite goes through the maps:* IPC channels, and main does the
// network work (or reads the local archive). Addresses:
//   asmap://a/<projectPath>/<mapId>/{z}/{x}/{y}   a tile from an installed archive
//   asmap://t/<base64url template>/{z}/{x}/{y}    an online tile
//   asmap://g/<base64url template>/{fontstack}/{range}   online glyphs
//   asmap://s/<base64url base>[@2x].json|png       online sprite
//   asmap://l/<fontstack>/<range>.pbf              bundled place-name glyphs (offline labels)
import type { RequestParameters, GetResourceResponse } from 'maplibre-gl'
import { call } from '../../../lib/api'
import { loadGlyphs } from './glyphs'

const b64 = (s: string): string => new TextDecoder().decode(base64urlToBytes(s))

function base64urlToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function toBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
}

async function archiveTile(parts: string[]): Promise<GetResourceResponse<ArrayBuffer>> {
  const [projectPath, mapId, z, x, y] = parts
  const tile = await call('maps:tile', {
    projectPath: decodeURIComponent(projectPath ?? ''),
    mapId: mapId ?? '',
    z: Number(z),
    x: Number(x),
    y: Number(y),
  })
  if (tile.data.byteLength === 0) throw new Error('No tile here')
  return { data: toBuffer(tile.data) }
}

async function onlineResource(url: string): Promise<GetResourceResponse<ArrayBuffer>> {
  const got = await call('maps:fetch', { url })
  return { data: toBuffer(got.data) }
}

/** Resolve one asmap:// request to bytes. Exported for tests. */
export async function loadAsmap(url: string): Promise<GetResourceResponse<ArrayBuffer>> {
  const rest = url.slice('asmap://'.length)
  const [kind, ...parts] = rest.split('/')
  if (kind === 'a') return archiveTile(parts)
  if (kind === 't') {
    const [tpl, z, x, y] = parts
    return onlineResource(
      b64(tpl ?? '')
        .replace('{z}', z ?? '')
        .replace('{x}', x ?? '')
        .replace('{y}', y ?? ''),
    )
  }
  if (kind === 'g') {
    const [tpl, stack, range] = parts
    return onlineResource(
      b64(tpl ?? '')
        .replace('{fontstack}', stack ?? '')
        .replace('{range}', (range ?? '').replace(/\.pbf$/, '')),
    )
  }
  if (kind === 's') {
    const m = /^([A-Za-z0-9_-]+)(.*)$/.exec(parts[0] ?? '')
    return onlineResource(b64(m?.[1] ?? '') + (m?.[2] ?? ''))
  }
  if (kind === 'l') {
    const [stack, range] = parts
    return { data: await loadGlyphs(decodeURIComponent(stack ?? ''), range ?? '') }
  }
  throw new Error('Unknown map address')
}

let registered = false
export function registerAsmap(addProtocol: (name: string, fn: never) => void): void {
  if (registered) return
  registered = true
  const fn = (params: RequestParameters) => loadAsmap(params.url)
  addProtocol('asmap', fn as never)
}
