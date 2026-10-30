/**
 * Media for live delivery (spec 0412 FR-7, FR-8): choose which of an inject's files go to
 * devices, make the phone-sized rendition of a template page, and upload each as a sealed blob.
 * Blobs on the LAN live in the app's memory with the session, so the cache here is per session
 * and nothing is written to the project folder.
 */
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import type { BlobMeta, BlobRef } from '@shared/live/schemas'
import type { Limits } from '@shared/live/protocol'
import type { Inject } from '@shared/schemas/inject'
import type { MediaAsset } from '@shared/schemas/media'
import { safeJoinReal } from '../lib/fs'

/** Widest device rendition, in pixels (1x of the template's 2x render). */
export const DEVICE_MAX_WIDTH = 1200
/** A release lists at most this many files (the protocol's cap). */
export const MAX_MEDIA = 6

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
}

export type MediaName = 'device' | 'original' | 'poster' | 'audio'

export interface MediaPlanItem {
  /** Cache key: asset id and name. */
  key: string
  name: MediaName
  asset: MediaAsset
  /** Path of the file within the project (the asset's, or its poster's). */
  rel: string
  kind: 'image' | 'video' | 'audio'
  /** Make the phone-sized PNG instead of sending the file as it is. */
  downscale: boolean
}

const IMAGE_ORDER: MediaAsset['role'][] = ['composite', 'rendered', 'generated', 'source']

const pickImage = (assets: readonly MediaAsset[]): MediaAsset | undefined =>
  assets
    .filter((a) => a.kind === 'image')
    .sort((a, b) => IMAGE_ORDER.indexOf(a.role) - IMAGE_ORDER.indexOf(b.role))[0]

/**
 * Which files an inject sends. A template page (2x) goes as a 1x `device` rendition first and
 * the full-size `original` second; photos, video and audio go as they are. PDFs stay home.
 */
export function planMedia(inject: Pick<Inject, 'assets'>): MediaPlanItem[] {
  const plan: MediaPlanItem[] = []
  const video = inject.assets.find((a) => a.kind === 'video')
  const image = pickImage(inject.assets)
  const audio = inject.assets.find((a) => a.kind === 'audio')
  if (video) {
    plan.push(item(video, 'device', video.path, 'video', false))
    if (video.posterPath) plan.push(item(video, 'poster', video.posterPath, 'image', false))
  } else if (image) {
    const template = image.role === 'rendered' || image.role === 'composite'
    const wide = (image.width ?? 0) > DEVICE_MAX_WIDTH
    plan.push(item(image, 'device', image.path, 'image', template))
    if (template && wide) plan.push(item(image, 'original', image.path, 'image', false))
  }
  if (audio) plan.push(item(audio, 'audio', audio.path, 'audio', false))
  return plan.slice(0, MAX_MEDIA)
}

function item(
  asset: MediaAsset,
  name: MediaName,
  rel: string,
  kind: MediaPlanItem['kind'],
  downscale: boolean,
): MediaPlanItem {
  return { key: `${asset.id}:${name}`, name, asset, rel, kind, downscale }
}

export interface StagedMedia {
  refs: BlobRef[]
  /** Names of files left out because they are over the connection's blob cap or failed. */
  omitted: { name: MediaName; reason: string }[]
}

export interface StageContext {
  root: string
  limits: Limits
  putBlob: (meta: BlobMeta, bytes: Uint8Array) => Promise<BlobRef>
  /** Shrinks a PNG to the given width; Electron's image API by default. */
  resize?: (png: Uint8Array, width: number) => Promise<Uint8Array>
  cache: Map<string, BlobRef>
}

async function electronResize(png: Uint8Array, width: number): Promise<Uint8Array> {
  const { nativeImage } = await import('electron')
  return nativeImage.createFromBuffer(Buffer.from(png)).resize({ width, quality: 'best' }).toPNG()
}

function mimeOf(rel: string, kind: MediaPlanItem['kind']): string {
  return MIME[extname(rel).toLowerCase()] ?? `${kind}/octet-stream`
}

/** Read, shrink if asked, check the cap, seal and upload one planned file. */
async function stageOne(ctx: StageContext, p: MediaPlanItem): Promise<BlobRef> {
  const hit = ctx.cache.get(p.key)
  if (hit) return hit
  let bytes: Uint8Array = await fs.readFile(safeJoinReal(ctx.root, p.rel))
  let width = p.asset.width
  let height = p.asset.height
  if (p.downscale && (width ?? Infinity) > DEVICE_MAX_WIDTH) {
    const target = Math.min(DEVICE_MAX_WIDTH, Math.ceil((width ?? DEVICE_MAX_WIDTH * 2) / 2))
    bytes = await (ctx.resize ?? electronResize)(bytes, target)
    height = width && height ? Math.round((height * target) / width) : undefined
    width = target
  }
  if (bytes.length > ctx.limits.blobBytes) {
    throw new Error(`${p.name} is ${bytes.length} bytes; the limit is ${ctx.limits.blobBytes}`)
  }
  const meta: BlobMeta = {
    kind: p.kind,
    mime: p.downscale ? 'image/png' : mimeOf(p.rel, p.kind),
    name: p.name,
    ...(p.kind !== 'audio' && width ? { width } : {}),
    ...(p.kind !== 'audio' && height ? { height } : {}),
    ...(p.asset.durationSec && p.kind !== 'image' ? { durationSec: p.asset.durationSec } : {}),
  }
  const ref = await ctx.putBlob(meta, bytes)
  ctx.cache.set(p.key, ref)
  return ref
}

/** Stage every file an inject sends; a file that cannot go is listed in `omitted`, never fatal. */
export async function stageInject(
  ctx: StageContext,
  inject: Pick<Inject, 'assets'>,
): Promise<StagedMedia> {
  const out: StagedMedia = { refs: [], omitted: [] }
  for (const p of planMedia(inject)) {
    try {
      out.refs.push(await stageOne(ctx, p))
    } catch (err) {
      out.omitted.push({ name: p.name, reason: (err as Error).message.slice(0, 200) })
    }
  }
  return out
}

/**
 * Upload one image file from the project as it is, or shrunk to the device width when it is
 * wider (a site plan for the map on devices). Undefined when it still exceeds the blob cap.
 */
export async function stageImageFile(
  ctx: StageContext,
  req: { key: string; rel: string; name: string; width?: number; height?: number },
): Promise<BlobRef | undefined> {
  const hit = ctx.cache.get(req.key)
  if (hit) return hit
  let bytes: Uint8Array = await fs.readFile(safeJoinReal(ctx.root, req.rel))
  let mime = mimeOf(req.rel, 'image')
  let { width, height } = req
  if (width && width > DEVICE_MAX_WIDTH) {
    bytes = await (ctx.resize ?? electronResize)(bytes, DEVICE_MAX_WIDTH)
    height = height ? Math.round((height * DEVICE_MAX_WIDTH) / width) : undefined
    width = DEVICE_MAX_WIDTH
    mime = 'image/png'
  }
  if (bytes.length > ctx.limits.blobBytes) return undefined
  const meta: BlobMeta = {
    kind: 'image',
    mime,
    name: req.name.slice(0, 120),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  }
  const ref = await ctx.putBlob(meta, bytes)
  ctx.cache.set(req.key, ref)
  return ref
}
