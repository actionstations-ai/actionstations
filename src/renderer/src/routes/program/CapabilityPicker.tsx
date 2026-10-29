// A checkbox group for the 32 Core Capabilities, grouped by nothing fancy: a scrollable list
// inside a fieldset, so it works with a keyboard and a screen reader.
import { CORE_CAPABILITIES, type CoreCapabilityId } from '@shared/core-capabilities'

export function CapabilityPicker(props: {
  legend: string
  value: CoreCapabilityId[]
  onChange: (next: CoreCapabilityId[]) => void
}) {
  const toggle = (id: CoreCapabilityId) =>
    props.onChange(
      props.value.includes(id) ? props.value.filter((v) => v !== id) : [...props.value, id],
    )
  return (
    <fieldset className="program-capabilities">
      <legend className="field__label">
        {props.legend} ({props.value.length} chosen)
      </legend>
      <div className="program-capabilities__list">
        {CORE_CAPABILITIES.map((c) => (
          <label key={c.id} className="row">
            <input
              type="checkbox"
              checked={props.value.includes(c.id)}
              onChange={() => toggle(c.id)}
            />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
