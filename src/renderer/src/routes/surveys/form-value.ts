// What a participant has filled in on a survey form, before it is cleaned and saved.
export interface FormValue {
  answers: Record<string, unknown>
  otherText: Record<string, string>
  roleGroup: string
}

export const emptyFormValue = (): FormValue => ({ answers: {}, otherText: {}, roleGroup: '' })
