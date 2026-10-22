// Shared bits of the schema form: issues by JSON pointer, control props, labels.
import { createContext, useContext } from 'react'
import type { FieldSpec } from './fields'

export const IssuesContext = createContext<Map<string, string>>(new Map())
export const useIssue = (path: string): string | undefined => useContext(IssuesContext).get(path)

export interface ControlProps<S extends FieldSpec = FieldSpec> {
  spec: S
  value: unknown
  onChange: (value: unknown) => void
  /** JSON pointer of this value inside fields ("/rows/0/gate"). */
  path: string
}

/** Visible label; required fields carry an asterisk (aria-required says it to readers). */
export const labelOf = (spec: FieldSpec): string => (spec.required ? `${spec.label} *` : spec.label)
