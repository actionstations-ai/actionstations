// Pack installer (ADR-0018 "Install location", #260): review, install, update, enable,
// disable, uninstall and verify packs under userData/packs/<id>/<version>/ with
// userData/packs/registry.json. No network: a URL or catalog install takes an archive that
// packs:download already staged.
//
// Install: readPack (full verification) → extract into .staging/<ulid>/ → files read-only →
// rename into <id>/<version>/ → registry written atomically → old version removed. Any failure
// before the registry write puts the previous folder back and leaves no new folder or entry.
// A staged download is deleted after the install, whether it worked or not.
//
// Same id: same version = reinstall; newer = update (one version is kept); older = downgrade,
// refused unless confirmed. A pack whose items an enabled pack already provides installs
// disabled; enabling it checks again.
//
// Bundled packs (ADR-0020) are listed too (source "bundled"): they can be enabled and disabled
// (except the core), never installed over, uninstalled, verified or updated here. An installed
// pack may not take a bundled pack's id.
import { promises as fs } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { DomainProfile } from '@shared/domains'
import { compareSemver, type PackInstallSource, type PackRegistryEntry } from '@shared/schemas/pack'
import type {
  InstalledPackView,
  PackInspectRequest,
  PackInspectResult,
  PackInstallAction,
  PackInstallRequest,
  PackInstallResult,
  PackReview,
  PackUpdateView,
  PackVerifyResult,
} from '@shared/ipc/packs'
import { AppError } from '../lib/errors'
import { newId, nowIso } from '../lib/ids'
import { cachedCatalogs, findUpdates } from './catalog'
import { extractPack } from './extract'
import { contentSha256, readPack, type PackBuiltins, type VerifiedPack } from './reader'
import { packIdDir, packVersionDir, packsStagingDir, writeRegistry } from './registry'
import {
  commitLoaded,
  conflictText,
  conflictsFor,
  ensurePacksLoaded,
  loadEntry,
  loadedBundled,
  loadedPacks,
  saveBundledEnabled,
  withPacksLock,
  type BundledState,
  type LoadedPack,
} from './state'
import { makeReadOnly, removeTree } from './tree'
import { verifyInstall } from './verify'
import { conflictReason } from './conflicts'
import { isBundledPackId, isCorePackId } from './bundled-map'

/** What the installer needs from its caller (the IPC boundary passes the app version). */
export interface PackContext {
  appVersion: string
  /** Shipped ids (default: loadBuiltins() through readPack). */
  builtins?: PackBuiltins
}

// ---- helpers ------------------------------------------------------------------------------

const within = (root: string, target: string): boolean => {
  const rel = relative(root, target)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/** Whether `path` is a file packs:download staged (userData/packs/.staging/…). */
async function isStaged(path: string): Promise<boolean> {
  const real = await fs.realpath(path).catch(() => undefined)
  const root = await fs.realpath(packsStagingDir()).catch(() => undefined)
  return !!real && !!root && within(root, real)
}

async function assertStaged(path: string): Promise<void> {
  if (!(await isStaged(path)))
    throw new AppError('FORBIDDEN', 'A downloaded pack must be in the packs staging folder')
}

/** An installed pack may not use the id of a pack included with the app. */
const bundledIdProblem = (id: string): string | undefined =>
  isBundledPackId(id)
    ? `${id} is the id of a pack included with the app; an installed pack needs its own id`
    : undefined

async function readOrFail(path: string, ctx: PackContext): Promise<VerifiedPack> {
  const read = await readPack({ path }, { appVersion: ctx.appVersion, builtins: ctx.builtins })
  const taken = read.ok ? bundledIdProblem(read.pack.manifest.id) : undefined
  if (taken) throw new AppError('VALIDATION', `This pack cannot be installed: ${taken}`)
  if (read.ok) return read.pack
  const first = read.problems[0]
  throw new AppError(
    'VALIDATION',
    `This pack cannot be installed: ${first?.path ? `${first.path}: ` : ''}${first?.message ?? 'invalid'}`,
    read.problems,
  )
}

function domainsOf(pack: VerifiedPack): DomainProfile[] {
  return pack.manifest.contents.domains.map((id) =>
    DomainProfile.parse(JSON.parse(pack.files.get(`domains/${id}.json`)!.toString('utf8'))),
  )
}

const installedOf = (id: string): LoadedPack | undefined =>
  loadedPacks().find((p) => p.entry.id === id)

function actionFor(version: string, installed: LoadedPack | undefined): PackInstallAction {
  if (!installed) return 'install'
  const cmp = compareSemver(version, installed.entry.version)
  return cmp === 0 ? 'reinstall' : cmp > 0 ? 'update' : 'downgrade'
}

interface Plan {
  action: PackInstallAction
  installed?: LoadedPack
  candidate: LoadedPack
  enabled: boolean
}

/** What installing `pack` would do, without touching the disk. */
function planFor(pack: VerifiedPack, entry: PackRegistryEntry): Plan {
  const installed = installedOf(pack.manifest.id)
  const candidate: LoadedPack = {
    entry,
    dir: packVersionDir(entry.id, entry.version),
    manifest: pack.manifest,
    domains: domainsOf(pack),
    conflicts: [],
  }
  candidate.conflicts = conflictsFor(candidate)
  const wanted = installed ? installed.entry.enabled || !!installed.broken : true
  return {
    action: actionFor(pack.manifest.version, installed),
    ...(installed ? { installed } : {}),
    candidate,
    enabled: wanted && candidate.conflicts.length === 0,
  }
}

const entryFor = (pack: VerifiedPack, source: PackInstallSource): PackRegistryEntry => ({
  id: pack.manifest.id,
  version: pack.manifest.version,
  enabled: true,
  installedAt: nowIso(),
  source,
  archiveSha256: pack.archiveSha256,
  contentSha256: pack.contentSha256,
  items: pack.items,
})

export function viewOf(p: LoadedPack): InstalledPackView {
  const m = p.manifest
  const conflict = conflictText(p)
  return {
    id: p.entry.id,
    version: p.entry.version,
    name: m?.name ?? p.entry.id,
    summary: m?.summary ?? '',
    description: m?.description ?? '',
    ...(m ? { author: m.author, license: m.license } : {}),
    ...(m?.homepage ? { homepage: m.homepage } : {}),
    domains: m?.domains ?? [],
    tags: m?.tags ?? [],
    enabled: p.entry.enabled,
    installedAt: p.entry.installedAt,
    source: p.entry.source,
    archiveSha256: p.entry.archiveSha256,
    contentSha256: p.entry.contentSha256,
    items: p.entry.items,
    ...(p.broken ? { broken: p.broken } : {}),
    ...(conflict ? { conflict } : {}),
    conflicts: p.conflicts,
  }
}

const bundledSha = new WeakMap<object, string>()

/** A bundled pack on the Packs screen ("Included with the app"). */
export function bundledViewOf(p: BundledState): InstalledPackView {
  const m = p.manifest
  let sha = bundledSha.get(m)
  if (!sha) bundledSha.set(m, (sha = contentSha256(m.files)))
  return {
    id: p.id,
    version: p.version,
    name: p.name,
    summary: m.summary,
    description: m.description,
    author: m.author,
    license: m.license,
    ...(m.homepage ? { homepage: m.homepage } : {}),
    domains: m.domains,
    tags: m.tags,
    enabled: p.enabled,
    installedAt: '',
    source: { kind: 'bundled' },
    archiveSha256: 'unknown',
    contentSha256: sha,
    items: [...p.items],
    bundled: true,
    core: p.core,
    ...(p.broken ? { broken: p.broken } : {}),
    conflicts: [],
  }
}

// ---- review -------------------------------------------------------------------------------

function reviewOf(pack: VerifiedPack, size: number, source: PackInstallSource): PackReview {
  const m = pack.manifest
  const plan = planFor(pack, entryFor(pack, source))
  const conflict = conflictReason(plan.candidate.conflicts)
  return {
    id: m.id,
    name: m.name,
    version: m.version,
    summary: m.summary,
    description: m.description,
    author: m.author,
    license: m.license,
    ...(m.homepage ? { homepage: m.homepage } : {}),
    minAppVersion: m.minAppVersion,
    domains: m.domains,
    tags: m.tags,
    size,
    archiveSha256: pack.archiveSha256,
    contentSha256: pack.contentSha256,
    source,
    items: pack.items,
    documents: m.documents,
    customNodes: [...new Set(pack.items.flatMap((i) => i.customNodes ?? []))].sort(),
    optionalNodes: [...new Set(pack.items.flatMap((i) => i.optionalNodes ?? []))].sort(),
    conflicts: plan.candidate.conflicts,
    ...(conflict ? { conflict } : {}),
    ...(plan.installed
      ? {
          installed: {
            version: plan.installed.entry.version,
            enabled: plan.installed.entry.enabled,
          },
        }
      : {}),
    action: plan.action,
    willEnable: plan.enabled,
  }
}

/**
 * Verify an archive and describe it for the review screen; installs nothing. A downloaded
 * archive that fails is deleted (it can never be installed).
 */
export async function inspectPack(
  req: PackInspectRequest,
  ctx: PackContext,
): Promise<PackInspectResult> {
  await ensurePacksLoaded()
  const path = 'filePath' in req ? req.filePath : req.downloadedPath
  const source: PackInstallSource =
    'filePath' in req ? { kind: 'file', name: basename(req.filePath) } : req.source
  if ('downloadedPath' in req) await assertStaged(path)
  const read = await readPack({ path }, { appVersion: ctx.appVersion, builtins: ctx.builtins })
  const taken = read.ok ? bundledIdProblem(read.pack.manifest.id) : undefined
  if (!read.ok || taken) {
    if ('downloadedPath' in req) await fs.rm(path, { force: true })
    return {
      ok: false,
      problems: read.ok ? [{ path: 'pack.json', message: taken! }] : read.problems,
    }
  }
  const size = (await fs.stat(path)).size
  return { ok: true, review: reviewOf(read.pack, size, source) }
}

// ---- install ------------------------------------------------------------------------------

/** Move `target` aside (if present) into staging; returns where, or undefined. */
async function moveAside(target: string): Promise<string | undefined> {
  const st = await fs.lstat(target).catch(() => null)
  if (!st) return undefined
  const aside = join(packsStagingDir(), `${newId()}-previous`)
  await fs.rename(target, aside)
  return aside
}

/** Put the extracted folder in place and write the registry; undo everything on failure. */
async function commitFolder(staged: string, plan: Plan): Promise<void> {
  const { candidate, installed } = plan
  const target = candidate.dir
  await fs.mkdir(dirname(target), { recursive: true })
  const displaced = await moveAside(target)
  try {
    await fs.rename(staged, target)
    const others = loadedPacks().filter((p) => p.entry.id !== candidate.entry.id)
    await writeRegistry([...others.map((p) => p.entry), candidate.entry])
  } catch (err) {
    await removeTree(target)
    if (displaced) await fs.rename(displaced, target).catch(() => undefined)
    if (!installed) await fs.rmdir(dirname(target)).catch(() => undefined)
    throw err
  }
  if (displaced) await removeTree(displaced)
  if (installed && installed.entry.version !== candidate.entry.version)
    await removeTree(packVersionDir(installed.entry.id, installed.entry.version))
}

async function installVerified(pack: VerifiedPack, req: PackInstallRequest): Promise<Plan> {
  const entry = entryFor(pack, req.source)
  const plan = planFor(pack, entry)
  if (plan.action === 'downgrade' && !req.confirmDowngrade)
    throw new AppError(
      'CONFLICT',
      `${pack.manifest.name} ${plan.installed!.entry.version} is installed; installing the older ${entry.version} needs confirmation`,
    )
  plan.candidate.entry = { ...entry, enabled: plan.enabled }
  const staged = join(packsStagingDir(), newId())
  try {
    await extractPack(pack, staged)
    await makeReadOnly(staged)
    await commitFolder(staged, plan)
  } finally {
    await removeTree(staged)
  }
  return plan
}

/** Install, reinstall, update or (confirmed) downgrade a pack. See the header. */
export async function installPack(
  req: PackInstallRequest,
  ctx: PackContext,
): Promise<PackInstallResult> {
  await ensurePacksLoaded()
  return withPacksLock(async () => {
    const staged = await isStaged(req.path)
    try {
      if (req.source.kind !== 'file' && !staged) await assertStaged(req.path)
      const pack = await readOrFail(req.path, ctx)
      const plan = await installVerified(pack, req)
      const next = loadedPacks().filter((p) => p.entry.id !== plan.candidate.entry.id)
      commitLoaded([...next, plan.candidate])
      return { pack: viewOf(installedOf(plan.candidate.entry.id)!), action: plan.action }
    } finally {
      if (staged) await fs.rm(req.path, { force: true })
    }
  })
}

// ---- enable / disable / uninstall / verify -------------------------------------------------

function requireInstalled(id: string): LoadedPack {
  const p = installedOf(id)
  if (!p) throw new AppError('NOT_FOUND', `Pack ${id} is not installed`)
  return p
}

async function saveEntries(next: readonly LoadedPack[]): Promise<void> {
  await writeRegistry(next.map((p) => p.entry))
  commitLoaded(next)
}

const bundledOf = (id: string): BundledState | undefined => loadedBundled().find((p) => p.id === id)

/** Turn a bundled pack on or off; the core cannot be turned off. */
async function setBundledEnabled(p: BundledState, enabled: boolean): Promise<InstalledPackView> {
  if (isCorePackId(p.id) && !enabled)
    throw new AppError('VALIDATION', `${p.name} is always on: the app needs it`)
  if (enabled && p.broken)
    throw new AppError('CONFLICT', `${p.name} is damaged (${p.broken}); reinstall the app`)
  await saveBundledEnabled(p.id, enabled)
  return bundledViewOf(bundledOf(p.id)!)
}

export async function setPackEnabled(id: string, enabled: boolean): Promise<InstalledPackView> {
  await ensurePacksLoaded()
  return withPacksLock(async () => {
    const bundled = bundledOf(id)
    if (bundled) return setBundledEnabled(bundled, enabled)
    const p = requireInstalled(id)
    if (enabled && p.broken)
      throw new AppError('CONFLICT', `${id} is damaged (${p.broken}); reinstall it to enable it`)
    if (enabled) {
      const conflicts = conflictsFor(p)
      if (conflicts.length) throw new AppError('CONFLICT', conflictReason(conflicts)!, conflicts)
    }
    const updated: LoadedPack = { ...p, entry: { ...p.entry, enabled } }
    await saveEntries(loadedPacks().map((x) => (x === p ? updated : x)))
    return viewOf(installedOf(id)!)
  })
}

/** Remove the registry entry, then the folder. Projects keep their copies (ADR-0018). */
export async function uninstallPack(id: string): Promise<void> {
  await ensurePacksLoaded()
  await withPacksLock(async () => {
    if (bundledOf(id))
      throw new AppError('FORBIDDEN', `${id} is included with the app; disable it instead`)
    requireInstalled(id)
    await saveEntries(loadedPacks().filter((p) => p.entry.id !== id))
    await removeTree(packIdDir(id))
  })
}

/** Re-hash every file of one pack (or all); refreshes broken state. */
export async function verifyPacks(id?: string): Promise<PackVerifyResult[]> {
  await ensurePacksLoaded()
  return withPacksLock(async () => {
    if (id) requireInstalled(id)
    const results: PackVerifyResult[] = []
    const next: LoadedPack[] = []
    for (const p of loadedPacks()) {
      if (id && p.entry.id !== id) {
        next.push(p)
        continue
      }
      const v = await verifyInstall(p.dir, p.entry, { deep: true })
      const fresh = v.ok ? await loadEntry(p.entry) : { ...p, broken: v.problem }
      next.push(fresh)
      results.push({
        id: p.entry.id,
        version: p.entry.version,
        ok: !fresh.broken,
        ...(fresh.broken ? { problem: fresh.broken } : {}),
      })
    }
    commitLoaded(next)
    return results
  })
}

/** Bundled packs (map order), then installed packs (by id). */
export async function listInstalled(): Promise<InstalledPackView[]> {
  await ensurePacksLoaded()
  return [...loadedBundled().map(bundledViewOf), ...loadedPacks().map(viewOf)]
}

/** Updates offered by the cached catalogs for the installed packs (no network). */
export async function packUpdates(ctx: PackContext): Promise<PackUpdateView[]> {
  await ensurePacksLoaded()
  const catalogs = await cachedCatalogs()
  const from = new Map(catalogs.flatMap((c) => c.catalog.packs.map((e) => [e, c.url] as const)))
  const installed = loadedPacks().map((p) => ({ id: p.entry.id, version: p.entry.version }))
  return findUpdates([...from.keys()], installed, ctx.appVersion).map((u) => ({
    ...u,
    catalogUrl: from.get(u.latest)!,
  }))
}
