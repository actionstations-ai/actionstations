// Effective privacy settings (project over global, FR-6, FR-9), the project facts that steer
// detection, and each project's placeholder registry (in memory, for the app session).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'
import {
  PrivacySettings,
  REDACTION_CATEGORIES,
  RedactionCategory,
  type Project,
  type ProjectPrivacy,
  type ReviewPolicy,
} from '@shared/schemas'
import { facilityFilePath, parseFacilityFile } from '../../generate/facility-file'
import { loadProject } from '../../project/store'
import { writeFileAtomic } from '../../lib/fs'
import { registerQuitFlush } from '../../lib/quit-flush'
import { userDataPath } from '../../lib/paths'
import { projectRedactionKey } from '../../secrets'
import { getSettings } from '../../settings/store'
import { notNameWords, type DetectContext } from './detect'
import { RedactionRegistry } from './redact'

export interface EffectivePrivacy {
  global: PrivacySettings
  /** This project's choices made on this computer (userData), which may relax the defaults. */
  project?: ProjectPrivacy
  /** The project file's own settings: they can only make review and redaction stricter. */
  projectFile?: ProjectPrivacy
  effective: PrivacySettings
}

/** Merge local overrides (chosen on this computer) over the global defaults, field by field. */
export function mergePrivacy(global: PrivacySettings, project?: ProjectPrivacy): PrivacySettings {
  return PrivacySettings.parse({
    review: project?.review ?? global.review,
    redact: { ...global.redact, ...(project?.redact ?? {}) },
    alwaysRedact: project?.alwaysRedact ?? global.alwaysRedact,
    neverRedact: project?.neverRedact ?? global.neverRedact,
  })
}

/** Review policies from least to most asking. */
const REVIEW_RANK: Record<ReviewPolicy, number> = {
  off: 0,
  'per-job': 1,
  'new-excerpts': 2,
  'new-content': 3,
  'every-request': 4,
}

export const isStricterReview = (a: ReviewPolicy, than: ReviewPolicy): boolean =>
  REVIEW_RANK[a] > REVIEW_RANK[than]

/**
 * Apply a project file's settings, which arrive with the folder (a copied project, a pack
 * example) and were never confirmed on this computer: they may ask more often, turn categories
 * on and add Always-redact terms, never the opposite (#454 review, finding 1).
 */
export function tightenWith(base: PrivacySettings, file?: ProjectPrivacy): PrivacySettings {
  if (!file) return base
  const redact = { ...base.redact }
  for (const c of REDACTION_CATEGORIES) if (file.redact?.[c] === true) redact[c] = true
  return PrivacySettings.parse({
    ...base,
    review: file.review && isStricterReview(file.review, base.review) ? file.review : base.review,
    redact,
    alwaysRedact: [...new Set([...base.alwaysRedact, ...(file.alwaysRedact ?? [])])].slice(0, 500),
  })
}

/** The part of a project's settings that is stricter than the defaults: safe to keep in the file. */
export function stricterPart(global: PrivacySettings, local: ProjectPrivacy): ProjectPrivacy {
  const out: ProjectPrivacy = {}
  if (local.review && isStricterReview(local.review, global.review)) out.review = local.review
  const on = REDACTION_CATEGORIES.filter(
    (c) => local.redact?.[c] === true && global.redact[c] === false,
  )
  if (on.length) out.redact = Object.fromEntries(on.map((c) => [c, true]))
  const extra = (local.alwaysRedact ?? []).filter((t) => !global.alwaysRedact.includes(t))
  if (extra.length) out.alwaysRedact = extra
  return out
}

/**
 * What this computer's per-project data (relaxed settings, redaction key, stored values) is filed
 * under: the project id together with the folder's real path. A copied folder, or a crafted
 * project.json reusing a known id, gets none of it (#454 re-review).
 */
export async function localProjectKey(
  projectPath: string,
  project: Pick<Project, 'id'>,
): Promise<string> {
  const real = await fs.realpath(projectPath).catch(() => resolve(projectPath))
  return createHash('sha256').update(`${project.id}\u0000${real}`).digest('hex').slice(0, 40)
}

async function projectOrUndefined(projectPath?: string): Promise<Project | undefined> {
  if (!projectPath) return undefined
  try {
    return await loadProject(projectPath)
  } catch {
    return undefined
  }
}

export async function privacyFor(projectPath?: string): Promise<EffectivePrivacy> {
  const settings = await getSettings()
  const global = settings.privacy
  const project = await projectOrUndefined(projectPath)
  const local =
    project && projectPath
      ? settings.projectPrivacy[await localProjectKey(projectPath, project)]
      : undefined
  const file = project?.privacy
  return {
    global,
    ...(local ? { project: local } : {}),
    ...(file ? { projectFile: file } : {}),
    effective: tightenWith(mergePrivacy(global, local), file),
  }
}

/** Categories that are on; a category missing from the settings is on (open question 3). */
export function enabledCategories(settings: PrivacySettings): Set<RedactionCategory> {
  return new Set(REDACTION_CATEGORIES.filter((c) => settings.redact[c] !== false))
}

async function facilityText(projectPath: string): Promise<string> {
  try {
    return await fs.readFile(facilityFilePath(projectPath), 'utf8')
  } catch {
    return ''
  }
}

/** Phrases that name roles, agencies, brands, places and documents: their words are not names. */
function projectPhrases(project: Project, agencies: string[]): string[] {
  const brand = project.brand
  return [
    project.name,
    project.orgName,
    ...(brand.city ? [brand.city] : []),
    ...(brand.region ? [brand.region] : []),
    ...Object.values(brand.aliases),
    ...project.defaultRoles.flatMap((r) => [r.name, r.abbreviation, r.team]),
    ...project.documents.flatMap((d) => [d.title, d.shortName ?? '']),
    ...agencies,
  ].filter(Boolean)
}

/** What detection needs to know about the project (FR-10). */
export async function detectContextFor(
  settings: PrivacySettings,
  projectPath?: string,
): Promise<DetectContext> {
  const project = await projectOrUndefined(projectPath)
  const facts =
    project && projectPath ? parseFacilityFile(await facilityText(projectPath)) : undefined
  const entries = (id: string): string[] =>
    facts?.categories.find((c) => c.id === id)?.entries ?? []
  return {
    knownPhones: entries('phones'),
    notNames: notNameWords([
      ...(project ? projectPhrases(project, entries('agencies')) : []),
      ...settings.neverRedact,
    ]),
    alwaysRedact: settings.alwaysRedact,
    neverRedact: settings.neverRedact,
  }
}

// ---- registries ----------------------------------------------------------------------------

/** Values kept per project at most. */
const MAX_STORED_VALUES = 50_000
const STORE_PURPOSE = 'action-stations redaction registry v1'

interface RegistryHandle {
  registry: RedactionRegistry
}

const registries = new Map<string, Promise<RegistryHandle>>()
const writes = new Map<string, Promise<void>>()

const storeFile = (localKey: string): string => userDataPath('redaction', `${localKey}.bin`)

function seal(registry: RedactionRegistry, plain: string): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', registry.derivedKey(STORE_PURPOSE), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

function unseal(registry: RedactionRegistry, sealed: Buffer): string {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    registry.derivedKey(STORE_PURPOSE),
    sealed.subarray(0, 12),
  )
  decipher.setAuthTag(sealed.subarray(12, 28))
  return Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString('utf8')
}

const StoredValues = z
  .array(z.object({ category: RedactionCategory, value: z.string().max(1000) }))
  .max(MAX_STORED_VALUES)

/** Re-issue the stored values in their original order, so placeholders keep their spelling. */
async function restoreValues(registry: RedactionRegistry, file: string): Promise<void> {
  let sealed: Buffer
  try {
    sealed = await fs.readFile(file)
  } catch {
    return
  }
  try {
    const parsed = StoredValues.safeParse(JSON.parse(unseal(registry, sealed)))
    if (parsed.success) for (const e of parsed.data) registry.issue(e.category, e.value)
  } catch {
    // Written under another key (a reset keychain): start over.
  }
}

/** Write the values (encrypted with a key derived from the project key) after each new one. */
function persistOnIssue(registry: RedactionRegistry, file: string): void {
  registry.onIssue = () => {
    const run = (writes.get(file) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const entries = registry.entries().slice(-MAX_STORED_VALUES)
        await fs.mkdir(dirname(file), { recursive: true })
        await writeFileAtomic(file, seal(registry, JSON.stringify(entries)))
        await fs.chmod(file, 0o600).catch(() => undefined)
      })
    writes.set(file, run)
  }
}

async function handleFor(projectPath?: string): Promise<RegistryHandle> {
  const project = await projectOrUndefined(projectPath)
  if (!project || !projectPath) return { registry: new RedactionRegistry(randomBytes(32)) }
  const local = await localProjectKey(projectPath, project)
  let key: Buffer | undefined
  try {
    key = await projectRedactionKey(local)
  } catch {
    key = undefined
  }
  // No OS keychain: a key for this session only, and nothing is stored.
  if (!key) return { registry: new RedactionRegistry(randomBytes(32)) }
  const registry = new RedactionRegistry(key)
  const file = storeFile(local)
  await restoreValues(registry, file)
  persistOnIssue(registry, file)
  return { registry }
}

/**
 * The project's registry; outside a project, one shared registry for the session. The values a
 * project has redacted are kept encrypted in userData (never in the project folder), so after a
 * restart a saved output naming someone the patterns would miss is still redacted.
 */
export function registryFor(projectPath?: string): Promise<RedactionRegistry> {
  const id = projectPath ? resolve(projectPath) : ''
  let r = registries.get(id)
  if (!r) {
    r = handleFor(projectPath)
    registries.set(id, r)
    r.catch(() => registries.delete(id))
  }
  return r.then((h) => h.registry)
}

/** Wait for pending writes of the stored values (tests, app quit). */
export async function flushRegistries(): Promise<void> {
  await Promise.all([...writes.values()].map((w) => w.catch(() => undefined)))
}

// Quitting waits (briefly) for these writes, so no redacted value is lost at exit.
registerQuitFlush(flushRegistries)

/** Tests only: forget the in-memory registries, as a restart does. */
export function resetRegistries(): void {
  registries.clear()
}
