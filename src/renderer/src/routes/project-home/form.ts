// Pure form-state helpers for the Project settings form (kept out of components for tests).
import type { Project, Role } from '@shared/schemas'

export const ORG_TYPES = ['airport', 'hospital', 'utility', 'campus', 'generic'] as const

export const ORG_TYPE_LABELS: Record<(typeof ORG_TYPES)[number], string> = {
  airport: 'Airport',
  hospital: 'Hospital',
  utility: 'Utility',
  campus: 'Campus',
  generic: 'Generic organization',
}

export interface AliasRow {
  rowId: string
  key: string
  value: string
}

/** A role being edited: standing orders as one-per-line text. */
export interface RoleDraft extends Omit<Role, 'standingOrders'> {
  standingOrdersText: string
}

export interface ProjectFormState {
  name: string
  orgName: string
  orgType: string
  city: string
  region: string
  primaryColor: string
  aliases: AliasRow[]
  roles: RoleDraft[]
}

export type FormErrors = Partial<Record<string, string>>

/** Path-safe id for new rows and roles (matches SafeId: starts alphanumeric). */
export const newRowId = (prefix = 'r'): string => `${prefix}${crypto.randomUUID()}`

export function toFormState(project: Project): ProjectFormState {
  return {
    name: project.name,
    orgName: project.orgName,
    orgType: project.orgType,
    city: project.brand.city ?? '',
    region: project.brand.region ?? '',
    primaryColor: project.brand.primaryColor ?? '',
    aliases: Object.entries(project.brand.aliases).map(([key, value]) => ({
      rowId: newRowId('a'),
      key,
      value,
    })),
    roles: project.defaultRoles.map((r) => ({
      ...r,
      standingOrdersText: r.standingOrders.join('\n'),
    })),
  }
}

export function emptyRole(): RoleDraft {
  return {
    id: newRowId('role-'),
    name: '',
    abbreviation: '',
    team: '',
    description: '',
    standingOrdersText: '',
  }
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Field-keyed validation messages; empty object means the form can be saved. */
export function validateForm(form: ProjectFormState): FormErrors {
  const errors: FormErrors = {}
  if (!form.name.trim()) errors.name = 'A project needs a name.'
  if (form.primaryColor && !HEX_COLOR.test(form.primaryColor))
    errors.primaryColor = 'Use a six-digit hex color such as #1F4E79.'
  const seen = new Set<string>()
  for (const row of form.aliases) {
    const key = row.key.trim()
    if (!key && !row.value.trim()) continue
    if (!key) errors[`alias:${row.rowId}`] = 'Give this alias a key.'
    else if (seen.has(key)) errors[`alias:${row.rowId}`] = `The key "${key}" is used twice.`
    seen.add(key)
  }
  for (const role of form.roles) {
    if (!role.name.trim()) errors[`role:${role.id}`] = 'A role needs a name.'
  }
  return errors
}

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

/** The project:update patch for a valid form. */
export function toPatch(form: ProjectFormState) {
  const aliases: Record<string, string> = {}
  for (const row of form.aliases) {
    const key = row.key.trim()
    if (key) aliases[key] = row.value.trim()
  }
  return {
    name: form.name.trim(),
    orgName: form.orgName.trim(),
    orgType: form.orgType,
    brand: {
      city: form.city.trim(),
      region: form.region.trim(),
      primaryColor: form.primaryColor.trim(),
      aliases,
    },
    defaultRoles: form.roles.map(({ standingOrdersText, ...role }) => ({
      ...role,
      name: role.name.trim(),
      abbreviation: role.abbreviation.trim(),
      team: role.team.trim(),
      description: role.description.trim(),
      standingOrders: lines(standingOrdersText),
    })),
  }
}

/** Whether saving the form would change anything (row ids are ignored). */
export function isDirty(form: ProjectFormState, project: Project): boolean {
  return JSON.stringify(toPatch(form)) !== JSON.stringify(toPatch(toFormState(project)))
}
