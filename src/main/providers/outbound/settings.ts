// Effective privacy settings (project over global, FR-6, FR-9), the project facts that steer
// detection, and each project's placeholder registry (in memory, for the app session).
import { randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import {
  PrivacySettings,
  REDACTION_CATEGORIES,
  type Project,
  type ProjectPrivacy,
  type RedactionCategory,
  type ReviewPolicy,
} from '@shared/schemas'
import { facilityFilePath, parseFacilityFile } from '../../generate/facility-file'
import { loadProject } from '../../project/store'
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
  const local = project ? settings.projectPrivacy[project.id] : undefined
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

const registries = new Map<string, Promise<RedactionRegistry>>()

async function keyFor(projectPath?: string): Promise<Buffer> {
  const project = await projectOrUndefined(projectPath)
  if (!project) return randomBytes(32)
  try {
    return (await projectRedactionKey(project.id)) ?? randomBytes(32)
  } catch {
    return randomBytes(32)
  }
}

/** The project's registry; outside a project, one shared registry for the session. */
export function registryFor(projectPath?: string): Promise<RedactionRegistry> {
  const id = projectPath ? resolve(projectPath) : ''
  let r = registries.get(id)
  if (!r) {
    r = keyFor(projectPath).then((key) => new RedactionRegistry(key))
    registries.set(id, r)
    r.catch(() => registries.delete(id))
  }
  return r
}

/** Tests only. */
export function resetRegistries(): void {
  registries.clear()
}
