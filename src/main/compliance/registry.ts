// Regulations and frameworks a project can use (#426, spec 0426 §2). Layer precedence as for
// domains: the project's own copy (<project>/compliance/<kind>/<id>.json) > an enabled installed
// pack > an enabled bundled pack. Enabling an item from an installed pack copies it into the
// project (ADR-0018 copies), so a shared project keeps its deadlines after the pack changes or
// is removed; bundled items are read from the app, so a rule update reaches every project.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { z } from 'zod'
import { resolveProfile } from '@shared/domains'
import type { ComplianceSource } from '@shared/ipc/compliance'
import { Framework, Regulation, type ProjectCompliance } from '@shared/schemas/compliance'
import type { Project } from '@shared/schemas/project'
import { safeJoin } from '../lib/fs'
import {
  bundledPacks,
  enabledPacks,
  packItemPath,
  packsRevision,
  type InstalledPack,
} from '../packs/layers'
import { copyPackItem } from '../packs/project-copies'

export type ComplianceKind = 'regulations' | 'frameworks'
const ID = /^[a-z][a-z0-9_]{0,63}$/

export interface Layered<T> {
  item: T
  source: ComplianceSource
}

const SCHEMA = { regulations: Regulation, frameworks: Framework } as const
type ItemOf<K extends ComplianceKind> = z.infer<(typeof SCHEMA)[K]>

/** Project-relative path of a project copy. */
export const projectCopyPath = (kind: ComplianceKind, id: string): string =>
  `compliance/${kind}/${id}.json`

async function readItem<K extends ComplianceKind>(
  kind: K,
  path: string,
): Promise<ItemOf<K> | undefined> {
  try {
    const parsed = SCHEMA[kind].safeParse(JSON.parse(await fs.readFile(path, 'utf8')))
    if (parsed.success) return parsed.data as ItemOf<K>
    console.error(`[compliance] ${path} is not a valid ${kind} record; it is ignored`)
  } catch (e) {
    console.error(`[compliance] cannot read ${path}:`, (e as Error).message)
  }
  return undefined
}

async function projectItems<K extends ComplianceKind>(root: string, kind: K) {
  const dir = safeJoin(root, 'compliance', kind)
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const out: Layered<ItemOf<K>>[] = []
  for (const name of names.sort()) {
    const id = name.endsWith('.json') ? name.slice(0, -5) : ''
    if (!ID.test(id)) continue
    const item = await readItem(kind, join(dir, name))
    if (item && item.id === id) out.push({ item, source: { layer: 'project' } })
  }
  return out
}

const packSource = (pack: InstalledPack): ComplianceSource => ({
  layer: pack.bundled ? 'bundled' : 'pack',
  packId: pack.id,
  packVersion: pack.version,
  packName: pack.name,
})

const packCache = new Map<ComplianceKind, { revision: number; items: Layered<unknown>[] }>()

/** Items of a kind across the enabled installed packs, then the enabled bundled packs. */
async function packItems<K extends ComplianceKind>(kind: K): Promise<Layered<ItemOf<K>>[]> {
  const revision = packsRevision()
  const cached = packCache.get(kind)
  if (cached?.revision === revision) return cached.items as Layered<ItemOf<K>>[]
  const packs = [...enabledPacks(), ...bundledPacks().filter((p) => p.enabled)]
  const out: Layered<ItemOf<K>>[] = []
  for (const pack of packs)
    for (const id of pack.manifest.contents[kind] ?? []) {
      const item = await readItem(kind, packItemPath(pack, kind, id))
      if (item) out.push({ item, source: packSource(pack) })
    }
  packCache.set(kind, { revision, items: out })
  return out
}

/** Every item of a kind the project can use, first layer wins per id. */
export async function layeredItems<K extends ComplianceKind>(
  root: string,
  kind: K,
): Promise<Layered<ItemOf<K>>[]> {
  const byId = new Map<string, Layered<ItemOf<K>>>()
  for (const l of [...(await projectItems(root, kind)), ...(await packItems(kind))])
    if (!byId.has(l.item.id)) byId.set(l.item.id, l)
  return [...byId.values()]
}

/** The ids the project's domain profile lists by default. */
export function profileDefaults(project: Project): { regulations: string[]; frameworks: string[] } {
  const profile = resolveProfile(
    project.orgType,
    project.domainProfileOverrides,
    project.domainProfileSnapshot,
  )
  return { regulations: profile.regulations ?? [], frameworks: profile.frameworks ?? [] }
}

/** Whether an item is on: the project's switch, else the profile's default. */
export function isEnabled(project: Project, kind: ComplianceKind, id: string): boolean {
  const set = project.compliance?.[kind]?.[id]
  return set ?? profileDefaults(project)[kind].includes(id)
}

/** Copy newly enabled items that come from an installed pack into the project. */
export async function copyEnabledFromPacks(
  root: string,
  kind: ComplianceKind,
  switches: ProjectCompliance[ComplianceKind],
): Promise<void> {
  const on = Object.entries(switches)
    .filter(([, v]) => v)
    .map(([id]) => id)
  if (!on.length) return
  const items = await layeredItems(root, kind)
  for (const id of on) {
    const l = items.find((x) => x.item.id === id)
    if (l?.source.layer !== 'pack') continue
    const pack = enabledPacks().find((p) => p.id === l.source.packId)
    if (!pack) continue
    await copyPackItem(root, {
      pack: { id: pack.id, version: pack.version, name: pack.name },
      kind,
      id,
      files: [{ from: packItemPath(pack, kind, id), to: projectCopyPath(kind, id) }],
    })
  }
}
