// Where a pack-provided item comes from (ADR-0018, #269). One badge for every place a template,
// prompt, workflow, domain profile, document or example can come from a pack: a source chip
// ("Pack: <name> <version>" or "From <name> <version>") and one chip per copy state ("edited",
// "not installed", "Update available"). Every state is a word with an icon, so colour is never
// the only signal; the accessible name spells out the pack name and every state. The data and
// text helpers live in lib/provenance.
import { clsx } from 'clsx'
import { ArrowUpCircle, Copy, Package, PackageX, Pencil, type LucideIcon } from 'lucide-react'
import {
  STATE_TEXT,
  provenanceLabel,
  provenanceSourceText,
  provenanceStates,
  type Provenance,
  type ProvenanceState,
} from '../lib/provenance'
import './provenance.css'

/** Tones are the app's status badge styles (contrast-checked in scripts/check-contrast.mjs). */
const STATE_STYLE: Record<ProvenanceState, { tone: string; icon: LucideIcon }> = {
  edited: { tone: 'badge--warn', icon: Pencil },
  'not-installed': { tone: 'badge--error', icon: PackageX },
  'update-available': { tone: 'badge--info', icon: ArrowUpCircle },
}

function Chip(props: { tone?: string; icon: LucideIcon; children: string; state?: string }) {
  const Icon = props.icon
  return (
    <span className={clsx('badge', props.tone)} data-state={props.state}>
      <Icon size={12} aria-hidden />
      {props.children}
    </span>
  )
}

export function ProvenanceBadge(props: { provenance: Provenance; className?: string }) {
  const p = props.provenance
  const label = provenanceLabel(p)
  return (
    <span
      className={clsx('provenance', props.className)}
      role="img"
      aria-label={label}
      title={label}
      data-testid="provenance-badge"
      data-origin={p.origin}
    >
      <Chip
        {...(p.origin === 'pack' ? { tone: 'badge--info' } : {})}
        icon={p.origin === 'pack' ? Package : Copy}
      >
        {provenanceSourceText(p)}
      </Chip>
      {provenanceStates(p).map((s) => (
        <Chip key={s} tone={STATE_STYLE[s].tone} icon={STATE_STYLE[s].icon} state={s}>
          {STATE_TEXT[s]}
        </Chip>
      ))}
    </span>
  )
}
