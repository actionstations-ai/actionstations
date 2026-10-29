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
} from '@shared/schemas'
import { facilityFilePath, parseFacilityFile } from '../../generate/facility-file'
import { loadProject } from '../../project/store'
import { projectRedactionKey } from '../../secrets'
import { getSettings } from '../../settings/store'
import { notNameWords, type DetectContext } from './detect'
import { RedactionRegistry } from './redact'

export interface EffectivePrivacy {
  global: PrivacySettings
  project?: ProjectPrivacy
  effective: PrivacySettings
}

/** Merge a project's overrides over the global defaults, field by field. */
export function mergePrivacy(global: PrivacySettings, project?: ProjectPrivacy): PrivacySettings {
  return PrivacySettings.parse({
    review: project?.review ?? global.review,
    redact: { ...global.redact, ...(project?.redact ?? {}) },
    alwaysRedact: project?.alwaysRedact ?? global.alwaysRedact,
    neverRedact: project?.neverRedact ?? global.neverRedact,
  })
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
  const global = (await getSettings()).privacy
  const project = (await projectOrUndefined(projectPath))?.privacy
  return { global, ...(project ? { project } : {}), effective: mergePrivacy(global, project) }
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
