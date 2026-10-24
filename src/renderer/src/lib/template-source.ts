// Where a template or inject type comes from (ADR-0018 layers, #261). Pack templates and
// project copies of them show a ProvenanceBadge (#269); these helpers give the badge data, the
// text for places that cannot hold a badge (native <option>s), and the note for the layers a
// badge does not cover (user templates, the project's own templates, "replaces built-in").
import type { TemplateInfo } from '@shared/ipc'
import type { InjectTypeInfo } from '@shared/taxonomy'
import { provenanceOf, provenanceText, type Provenance } from './provenance'

type TemplateSourceFields = Pick<
  TemplateInfo,
  'source' | 'packId' | 'packVersion' | 'packName' | 'replaces' | 'copy'
>

/** Badge data for a pack template or a project copy of one; undefined otherwise. */
export const templateProvenanceOf = (t: TemplateSourceFields): Provenance | undefined =>
  t.source === 'builtin' || t.source === 'user' ? undefined : provenanceOf(t)

/** One line of text: "" for built-in, else e.g. "Pack: Freight Rail Operations 1.0.0". */
export function templateSourceLabel(t: TemplateSourceFields): string {
  const p = templateProvenanceOf(t)
  if (p) return provenanceText(p)
  if (t.source === 'user') return 'user template'
  if (t.source === 'project') return 'project template'
  return ''
}

/** What the badge does not say: "user template", "project template", "replaces built-in". */
export function templateNote(t: TemplateSourceFields): string {
  const parts: string[] = []
  if (!templateProvenanceOf(t)) {
    if (t.source === 'user') parts.push('user template')
    if (t.source === 'project') parts.push('project template')
  }
  if (t.source !== 'builtin' && t.replaces === 'builtin') parts.push('replaces built-in')
  return parts.join(' · ')
}

/** Badge data for an inject type a pack template (or a project copy of one) adds. */
export function injectTypeProvenance(
  t: Pick<InjectTypeInfo, 'source' | 'pack'>,
): Provenance | undefined {
  if (!t.pack || (t.source !== 'pack' && t.source !== 'project')) return undefined
  return provenanceOf({
    source: t.source,
    packId: t.pack.id,
    packVersion: t.pack.version,
    ...(t.pack.name ? { packName: t.pack.name } : {}),
  })
}

/** "" for built-in inject types and pack types (those show a badge), else the layer. */
export function injectTypeSourceLabel(t: Pick<InjectTypeInfo, 'source' | 'pack'>): string {
  if (!t.source || injectTypeProvenance(t)) return ''
  return t.source === 'user' ? 'user template' : 'project template'
}
