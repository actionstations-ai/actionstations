// Threat family choice on the generate brief (#169): the project's profile families as a
// radio group, with "Suggested" first (inferred from the brief, the idea or the profile
// default, with the reason shown). The designer's choice wins.
import { useId } from 'react'
import type { DomainProfile, ThreatFamilyId } from '@shared/domains'
import {
  suggestionWhy,
  threatFamiliesFor,
  threatLabel,
  type ThreatSuggestion,
} from '../../lib/domains'
import '../../components/domain.css'

const AUTO = 'auto'

export function ThreatChoice(props: {
  profile: DomainProfile
  suggestion: ThreatSuggestion
  value: ThreatFamilyId | undefined
  onChange: (v: ThreatFamilyId | undefined) => void
}) {
  const name = useId()
  const whyId = `${name}-why`
  const families = threatFamiliesFor(props.profile)
  const current = props.value ?? AUTO
  const suggestedLabel = threatLabel(props.suggestion.id)
  return (
    <fieldset className="threat-choice" aria-describedby={whyId}>
      <legend className="field__label">Threat family</legend>
      <p id={whyId} className="threat-choice__suggested">
        <strong>Suggested: {suggestedLabel}</strong>{' '}
        <span className="muted">
          — {suggestionWhy(props.suggestion, props.profile)}. It sets the phase arc, the decision
          points and the checks the MSEL must pass.
        </span>
      </p>
      <div className="threat-choice__options">
        <label className="threat-choice__option">
          <input
            type="radio"
            name={name}
            value={AUTO}
            checked={current === AUTO}
            onChange={() => props.onChange(undefined)}
          />
          <span className="threat-choice__title">Use the suggestion</span>
          <span className="threat-choice__desc">
            {suggestedLabel}, updated as you edit the brief.
          </span>
        </label>
        {families.map((f) => (
          <label key={f.id} className="threat-choice__option">
            <input
              type="radio"
              name={name}
              value={f.id}
              checked={current === f.id}
              onChange={() => props.onChange(f.id)}
            />
            <span className="threat-choice__title">{f.label}</span>
            <span className="threat-choice__desc">{f.description}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
