// Scenario overview: theme, threat, operational impact, location, audience, and the plan
// sections it tests (citation chips; new citations come from regenerating with retrieval).
import type { GroundingResult } from '@shared/schemas/grounding'
import { GroundingBadge } from '../../../components/GroundingBadge'
import { useIpcQuery } from '../../../lib/query'
import { X } from 'lucide-react'
import type { Citation } from '@shared/schemas/common'
import type { ScenarioOverview } from '@shared/schemas/scenario'
import { Empty, TextField } from './inputs'
import { PartFrame, type PartEditorProps } from './PartFrame'
import { useScenarioPart, type PartSpec } from './use-scenario-part'

const BLANK: ScenarioOverview = {
  theme: '',
  threat: '',
  operationalImpact: '',
  coreSectionsTested: [],
  targetAudience: '',
  location: '',
}

const OVERVIEW_PART: PartSpec<ScenarioOverview> = {
  pick: (s) => s.overview ?? BLANK,
  apply: (s, overview) => ({ ...s, overview }),
  id: 'overview',
  label: 'Overview',
  note: 'Edited overview',
}

const shortHeading = (c: Citation) => c.headingPath.split('›').at(-1)?.trim() || c.documentTitle

function CitationChipList(props: {
  citations: Citation[]
  onRemove: (i: number) => void
  grounding?: Record<string, GroundingResult> | undefined
}) {
  if (!props.citations.length) return <Empty>No plan sections cited.</Empty>
  return (
    <ul className="citations citations--editable" aria-label="Core sections tested">
      {props.citations.map((c, i) => (
        <li
          key={`${c.documentId}-${i}`}
          className="citation"
          title={[c.headingPath, c.quote].filter(Boolean).join('\n')}
        >
          <span className="citation__doc">{c.headingPath.split('›')[0]?.trim()}</span>
          <span className="citation__heading">{shortHeading(c)}</span>
          <GroundingBadge result={props.grounding?.[`overview:${i}`]} compact />
          <button
            type="button"
            className="chip__remove"
            aria-label={`Remove ${c.headingPath}`}
            onClick={() => props.onRemove(i)}
          >
            <X size={12} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}

const FIELDS: {
  key: keyof Omit<ScenarioOverview, 'coreSectionsTested'>
  label: string
  multiline?: boolean
}[] = [
  { key: 'theme', label: 'Theme' },
  { key: 'threat', label: 'The threat', multiline: true },
  { key: 'operationalImpact', label: 'Operational impact', multiline: true },
  { key: 'location', label: 'Location' },
  { key: 'targetAudience', label: 'Target audience' },
]

export function OverviewEditor(props: PartEditorProps) {
  const part = useScenarioPart(props.projectPath, props.scenario, OVERVIEW_PART)
  const grounding = useIpcQuery('grounding:scenario', {
    projectPath: props.projectPath,
    scenarioId: props.scenario.id,
  })
  const o = part.value
  const hasContent = !!(o.theme || o.threat || o.operationalImpact)
  return (
    <PartFrame
      {...props}
      title="Scenario overview"
      part="overview"
      noun="overview"
      hasContent={hasContent}
      editor={part}
    >
      <div className="stack overview-editor">
        {FIELDS.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            multiline={!!f.multiline}
            rows={3}
            value={o[f.key]}
            onChange={(v) => part.update((p) => ({ ...p, [f.key]: v }))}
          />
        ))}
        <div className="field">
          <span className="field__label">Core sections tested</span>
          <CitationChipList
            citations={o.coreSectionsTested}
            grounding={grounding.data?.items}
            onRemove={(i) =>
              part.update((p) => ({
                ...p,
                coreSectionsTested: p.coreSectionsTested.filter((_, k) => k !== i),
              }))
            }
          />
          <span className="field__hint">Regenerate the overview to cite other plan sections.</span>
        </div>
      </div>
    </PartFrame>
  )
}
