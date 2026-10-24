// State, step checks and the request of the Export as pack wizard (#271). Pure functions so
// the steps' rules are tested without rendering. Main checks everything again (and the pack
// reader has the last word); these checks only tell the author what a step is missing before "Next".
import type { PackExportRequest, PackExportSources } from '@shared/ipc'
import {
  PACK_ITEM_ID,
  PackDomainId,
  PackId,
  PackTag,
  SemVer,
  SpdxExpression,
} from '@shared/schemas/pack'
import { z } from 'zod'

export const STEPS = [
  { id: 'items', label: 'Choose items' },
  { id: 'metadata', label: 'Metadata' },
  { id: 'licenses', label: 'Licenses' },
  { id: 'review', label: 'Review' },
  { id: 'save', label: 'Save' },
  { id: 'share', label: 'Share' },
] as const
export type StepId = (typeof STEPS)[number]['id']

export interface DocumentChoice {
  include: boolean
  license: string
}

export interface WizardState {
  projectPath: string | null
  templates: string[]
  prompts: string[]
  workflows: string[]
  includeDomain: boolean
  domainId: string
  domainLabel: string
  documents: Record<string, DocumentChoice>
  includeExample: boolean
  example: { slug: string; title: string; summary: string; notice: string }
  meta: {
    name: string
    id: string
    /** The user typed an id: stop following the name. */
    idEdited: boolean
    version: string
    summary: string
    description: string
    authorName: string
    authorUrl: string
    authorEmail: string
    homepage: string
    domains: string
    tags: string
  }
  /** The pack license; empty until the author chooses (there is no default). */
  license: string
  confirmed: boolean
}

export function initialState(projectPath: string | null): WizardState {
  return {
    projectPath,
    templates: [],
    prompts: [],
    workflows: [],
    includeDomain: false,
    domainId: '',
    domainLabel: '',
    documents: {},
    includeExample: false,
    example: { slug: '', title: '', summary: '', notice: '' },
    meta: {
      name: '',
      id: '',
      idEdited: false,
      version: '1.0.0',
      summary: '',
      description: '',
      authorName: '',
      authorUrl: '',
      authorEmail: '',
      homepage: '',
      domains: '',
      tags: '',
    },
    license: '',
    confirmed: false,
  }
}

/** Fill the project-dependent defaults once the project's sources arrive. */
export function withProjectDefaults(s: WizardState, src: PackExportSources): WizardState {
  const p = src.project
  if (!p) return { ...s, includeDomain: false, includeExample: false, documents: {} }
  const documents: Record<string, DocumentChoice> = {}
  for (const d of p.documents)
    documents[d.id] = {
      include: s.documents[d.id]?.include ?? false,
      license: s.documents[d.id]?.license ?? d.license ?? '',
    }
  return {
    ...s,
    documents,
    domainId: s.domainId || `${p.domain.id}_custom`.slice(0, 60),
    domainLabel: s.domainLabel || `${p.domain.label} (custom)`,
    example: {
      slug: s.example.slug || p.exampleSlug,
      title: s.example.title || p.name,
      summary: s.example.summary,
      notice: s.example.notice || p.exampleNotice || '',
    },
  }
}

/** A reverse-DNS label from free text: lowercase letters, digits and inner hyphens. */
export function idLabel(text: string, fallback: string): string {
  const s = text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/, '')
  return s || fallback
}

/** io.github.<user>.<name>: a domain the author controls, from their GitHub user name. */
export const suggestPackId = (user: string, name: string): string =>
  `io.github.${idLabel(user, 'you')}.${idLabel(name, 'my-pack')}`

export const splitList = (text: string): string[] =>
  text
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)

export const includedDocuments = (s: WizardState): string[] =>
  Object.entries(s.documents)
    .filter(([, d]) => d.include)
    .map(([id]) => id)

export function itemCount(s: WizardState): number {
  return (
    s.templates.length +
    s.prompts.length +
    s.workflows.length +
    includedDocuments(s).length +
    (s.includeDomain ? 1 : 0) +
    (s.includeExample ? 1 : 0)
  )
}

const ok = (schema: z.ZodType, v: unknown): boolean => schema.safeParse(v).success

/** Why the items step cannot continue (empty when it can). */
export function itemsIssues(s: WizardState): string[] {
  const out: string[] = []
  if (itemCount(s) === 0) out.push('Choose at least one item.')
  if (s.includeDomain && !ok(PackDomainId, s.domainId))
    out.push('The domain id uses lowercase letters, digits and _ and starts with a letter.')
  if (s.includeDomain && !s.domainLabel.trim()) out.push('Give the domain a label.')
  if (s.includeExample) {
    if (!PACK_ITEM_ID.examples.test(s.example.slug))
      out.push('The example id uses lowercase letters, digits, - and _.')
    if (!s.example.title.trim()) out.push('Give the example a title.')
    if (!s.example.summary.trim()) out.push('Write a short summary of the example.')
    if (!s.example.notice.trim())
      out.push('The example needs notice text (shown in every project opened from it).')
  }
  return out
}

export function metadataIssues(s: WizardState): string[] {
  const m = s.meta
  const out: string[] = []
  if (!m.name.trim()) out.push('Name the pack.')
  if (!ok(PackId, m.id)) out.push('The id must be reverse-DNS, e.g. io.github.you.my-pack.')
  if (!ok(SemVer, m.version)) out.push('The version must be a semantic version like 1.0.0.')
  if (!m.summary.trim()) out.push('Write a one-line summary.')
  if (m.summary.length > 200) out.push('The summary is longer than 200 characters.')
  if (!m.authorName.trim()) out.push('Name the author.')
  if (m.authorUrl && !ok(z.url({ protocol: /^https?$/ }), m.authorUrl))
    out.push('The author URL must start with http:// or https://.')
  if (m.authorEmail && !ok(z.email(), m.authorEmail)) out.push('The author email is not valid.')
  if (m.homepage && !ok(z.url({ protocol: /^https?$/ }), m.homepage))
    out.push('The homepage must start with http:// or https://.')
  if (!splitList(m.domains).every((d) => ok(PackDomainId, d)))
    out.push('Domains are domain ids such as transit or water_utility.')
  if (!splitList(m.tags).every((t) => ok(PackTag, t)))
    out.push('Tags use lowercase letters, digits and -.')
  return out
}

export function licenseIssues(s: WizardState, titles: Record<string, string>): string[] {
  const out: string[] = []
  if (!s.license.trim()) out.push('Choose the pack license.')
  else if (!ok(SpdxExpression, s.license.trim()))
    out.push('The pack license must be an SPDX expression or LicenseRef-….')
  for (const id of includedDocuments(s)) {
    const lic = s.documents[id]!.license.trim()
    const title = titles[id] ?? id
    if (!lic) out.push(`Document "${title}" has no license.`)
    else if (!ok(SpdxExpression, lic))
      out.push(`Document "${title}": "${lic}" is not an SPDX license expression.`)
  }
  if (!s.confirmed) out.push('Confirm that you may redistribute this content.')
  return out
}

export function issuesFor(step: StepId, s: WizardState, titles: Record<string, string>) {
  if (step === 'items') return itemsIssues(s)
  if (step === 'metadata') return metadataIssues(s)
  if (step === 'licenses') return licenseIssues(s, titles)
  return []
}

const opt = (v: string): string | undefined => (v.trim() ? v.trim() : undefined)

/** The request main builds the pack from. */
export function toRequest(s: WizardState): PackExportRequest {
  const m = s.meta
  const project =
    s.projectPath && (s.includeDomain || s.includeExample || includedDocuments(s).length)
  return {
    metadata: {
      id: m.id.trim(),
      name: m.name.trim(),
      version: m.version.trim(),
      summary: m.summary.trim(),
      ...(opt(m.description) ? { description: opt(m.description) } : {}),
      author: {
        name: m.authorName.trim(),
        ...(opt(m.authorUrl) ? { url: opt(m.authorUrl) } : {}),
        ...(opt(m.authorEmail) ? { email: opt(m.authorEmail) } : {}),
      },
      license: s.license.trim(),
      ...(opt(m.homepage) ? { homepage: opt(m.homepage) } : {}),
      domains: splitList(m.domains),
      tags: splitList(m.tags),
    },
    templates: s.templates,
    prompts: s.prompts,
    workflows: s.workflows,
    ...(project ? { projectPath: s.projectPath! } : {}),
    ...(s.includeDomain ? { domain: { id: s.domainId, label: s.domainLabel.trim() } } : {}),
    documents: includedDocuments(s).map((documentId) => ({
      documentId,
      license: s.documents[documentId]!.license.trim(),
    })),
    ...(s.includeExample
      ? {
          example: {
            slug: s.example.slug,
            title: s.example.title.trim(),
            summary: s.example.summary.trim(),
            notice: s.example.notice.trim(),
          },
        }
      : {}),
    redistributeConfirmed: s.confirmed,
  }
}

export const toggle = (list: string[], id: string, on: boolean): string[] =>
  on ? [...new Set([...list, id])] : list.filter((x) => x !== id)

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export type Update = (fn: (s: WizardState) => WizardState) => void
