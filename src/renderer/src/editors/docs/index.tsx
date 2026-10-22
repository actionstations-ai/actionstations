// Tab bodies for the scenario screen's editable parts.
import { useState } from 'react'
import type { ScenarioDocKind } from '@shared/schemas/scenario'
import { Button } from '../../components/ui'
import { MarkdownDocEditor } from './MarkdownDocEditor'
import { DOC_LABELS, DOC_ORDER } from './owners'
import { HotwashEditor } from './structured/HotwashEditor'
import { ObjectivesRolesEditor } from './structured/ObjectivesRolesEditor'
import { OverviewEditor } from './structured/OverviewEditor'
import type { PartEditorProps } from './structured/PartFrame'
import { RubricEditor } from './structured/RubricEditor'
import { SimcellEditor } from './structured/SimcellEditor'
import './docs.css'

export type TabProps = PartEditorProps

export const OverviewTab = (props: TabProps) => <OverviewEditor {...props} />

export const RubricTab = (props: TabProps) => <RubricEditor {...props} />

export function ObjectivesTab(props: TabProps) {
  return (
    <div className="stack stack--loose">
      <ObjectivesRolesEditor {...props} />
      <SimcellEditor {...props} />
    </div>
  )
}

export function DocumentsTab(props: TabProps) {
  const available = DOC_ORDER.filter((k) => props.scenario.documents[k])
  const [kind, setKind] = useState<ScenarioDocKind>(available[0] ?? 'handbook')
  return (
    <div className="stack stack--loose">
      <div className="row" role="group" aria-label="Document">
        {DOC_ORDER.map((k) => (
          <Button
            key={k}
            size="sm"
            variant={k === kind ? 'primary' : 'default'}
            aria-pressed={k === kind}
            onClick={() => setKind(k)}
          >
            {DOC_LABELS[k]}
          </Button>
        ))}
      </div>
      {kind === 'hotwash' && <HotwashEditor {...props} />}
      <MarkdownDocEditor key={kind} {...props} kind={kind} />
    </div>
  )
}
