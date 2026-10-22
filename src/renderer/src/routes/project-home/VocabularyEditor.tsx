// "Customize vocabulary" disclosure in Project settings (#169).
import { useId, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { DomainProfileOverrides } from '@shared/domains'
import { Badge, Button } from '../../components/ui'
import { resolveOrgType } from '../../lib/domains'
import { ListEditor } from '../generate/ListEditor'
import { VOCAB_FIELDS, customizedCount, resetVocab, setVocabList, vocabLists } from './vocabulary'

export function VocabularyEditor(props: {
  orgType: string
  overrides: DomainProfileOverrides
  onChange: (o: DomainProfileOverrides) => void
}) {
  const bodyId = useId()
  const [open, setOpen] = useState(false)
  const lists = vocabLists(props.orgType, props.overrides)
  const count = customizedCount(props.overrides)
  const profile = resolveOrgType(props.orgType).profile
  return (
    <div className="domain-overrides">
      <Button
        variant="ghost"
        className="domain-overrides__toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        Customize vocabulary
        {count > 0 && <Badge tone="info">{count} customized</Badge>}
      </Button>
      {open && (
        <div id={bodyId} className="domain-overrides__body">
          <p className="muted">
            Starts from the {profile.label} profile. Changes apply to this project only; prompts and
            lints read these lists.
          </p>
          {VOCAB_FIELDS.map(({ field, label, placeholder }) => (
            <ListEditor
              key={field}
              label={label}
              variant="chips"
              items={lists[field]}
              placeholder={placeholder}
              onChange={(items) =>
                props.onChange(setVocabList(props.orgType, props.overrides, field, items))
              }
            />
          ))}
          <div className="row">
            <Button
              size="sm"
              disabled={count === 0}
              onClick={() => props.onChange(resetVocab(props.overrides))}
            >
              Reset to {profile.label} defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
