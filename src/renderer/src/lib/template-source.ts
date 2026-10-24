// Plain text for where a template or inject type comes from (ADR-0018 layers, #261). The
// provenance badges (#269) will replace these labels; the data is already on TemplateInfo and
// on the registered inject types.
import type { TemplateInfo } from '@shared/ipc'
import type { InjectTypeInfo } from '@shared/taxonomy'

const packText = (name: string | undefined, id: string | undefined): string =>
  name ?? id ?? 'a pack'

/** "" for built-in templates, else e.g. "Freight Rail Operations pack", "user template". */
export function templateSourceLabel(
  t: Pick<TemplateInfo, 'source' | 'packId' | 'packName' | 'replaces' | 'copy'>,
): string {
  switch (t.source) {
    case 'builtin':
      return ''
    case 'pack':
      return `${packText(t.packName, t.packId)} pack`
    case 'user':
      return 'user template'
    case 'project': {
      if (!t.packId) return 'project template'
      const parts = [`project copy from ${packText(t.packName, t.packId)}`]
      if (t.copy?.edited) parts.push('edited')
      if (t.copy?.updateAvailable) parts.push('update available')
      if (t.copy?.packMissing) parts.push('pack not installed')
      return parts.join(', ')
    }
  }
}

/** Source text plus "replaces built-in" when the template shadows a built-in one. */
export function templateProvenance(
  t: Pick<TemplateInfo, 'source' | 'packId' | 'packName' | 'replaces' | 'copy'>,
): string {
  const label = templateSourceLabel(t)
  if (!label) return ''
  return t.replaces === 'builtin' ? `${label} · replaces built-in` : label
}

/** "" for built-in inject types, else the layer that adds the type. */
export function injectTypeSourceLabel(t: Pick<InjectTypeInfo, 'source' | 'pack'>): string {
  if (!t.source) return ''
  if (t.source === 'pack') return `${packText(t.pack?.name, t.pack?.id)} pack`
  if (t.source === 'user') return 'user template'
  return t.pack ? `project copy from ${packText(t.pack.name, t.pack.id)}` : 'project template'
}
