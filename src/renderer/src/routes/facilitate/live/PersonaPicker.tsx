// Who is speaking (spec 0413 FR-4): the scenario's SimCell roles, the MSEL senders, SimCell and
// Controller, or free text. Presentation only: the log always says the controller sent it.
import { useId, useState } from 'react'

const OTHER = '__other__'

export function PersonaPicker({
  options,
  value,
  onChange,
}: {
  options: string[]
  value: string
  onChange: (persona: string) => void
}) {
  const id = useId()
  const listed = options.includes(value)
  const [custom, setCustom] = useState(!listed && value !== '')
  return (
    <div className="fac-msg__persona">
      <label htmlFor={id} className="field__label">
        Reply as
      </label>
      <select
        id={id}
        className="select"
        value={custom ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setCustom(true)
            onChange('')
          } else {
            setCustom(false)
            onChange(e.target.value)
          }
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={OTHER}>Someone else…</option>
      </select>
      {custom && (
        <>
          <label htmlFor={`${id}-custom`} className="sr-only">
            Name of who is speaking
          </label>
          <input
            id={`${id}-custom`}
            className="input"
            value={value}
            maxLength={80}
            placeholder="Name of who is speaking"
            onChange={(e) => onChange(e.target.value)}
          />
        </>
      )}
    </div>
  )
}
