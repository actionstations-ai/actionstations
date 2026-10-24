import { clsx } from 'clsx'
import type { PromptEntry } from '@shared/schemas/prompt'
import { Badge } from '../../components/ui'
import { ProvenanceBadge } from '../../components/ProvenanceBadge'
import { provenanceOf } from '../../lib/provenance'
import { groupByStage, LAYER_LABEL, stageLabel } from './prompt-utils'

/** The pack layer of a prompt (#269); prompts are never copied, so always "Pack: …". */
function PackLayerBadge({ entry }: { entry: PromptEntry }) {
  const provenance = provenanceOf({ ...entry, source: 'pack' })
  if (provenance) return <ProvenanceBadge provenance={provenance} />
  return (
    <Badge tone={entry.effectiveSource === 'pack' ? 'info' : 'neutral'}>{LAYER_LABEL.pack}</Badge>
  )
}

function SourceBadges({ entry, showProject }: { entry: PromptEntry; showProject: boolean }) {
  return (
    <span className="prompt-list__badges">
      {entry.effectiveSource === 'default' && <Badge>{LAYER_LABEL.default}</Badge>}
      {entry.hasPackLayer && <PackLayerBadge entry={entry} />}
      {entry.hasGlobalOverride && (
        <Badge tone={entry.effectiveSource === 'global' ? 'info' : 'neutral'}>
          {LAYER_LABEL.global}
        </Badge>
      )}
      {showProject && entry.hasProjectOverride && <Badge tone="warn">{LAYER_LABEL.project}</Badge>}
    </span>
  )
}

export function PromptList(props: {
  entries: PromptEntry[]
  selected: string | undefined
  showProject: boolean
  onSelect: (name: string) => void
}) {
  return (
    <nav className="prompt-list" aria-label="Prompts by stage">
      {groupByStage(props.entries).map((group) => (
        <section key={group.stage} className="prompt-list__group">
          <h2 className="prompt-list__stage">{stageLabel(group.stage)}</h2>
          <ul>
            {group.entries.map((entry) => (
              <li key={entry.name}>
                <button
                  type="button"
                  className={clsx(
                    'prompt-list__item',
                    entry.name === props.selected && 'is-selected',
                  )}
                  aria-current={entry.name === props.selected ? 'true' : undefined}
                  onClick={() => props.onSelect(entry.name)}
                >
                  <span className="prompt-list__name mono">{entry.name}</span>
                  {entry.description && (
                    <span className="prompt-list__desc">{entry.description}</span>
                  )}
                  <SourceBadges entry={entry} showProject={props.showProject} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}
