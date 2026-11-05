import { describe, expect, it } from 'vitest'
import { WARNING_FORM } from '../../../shared/decisions/fixtures'
import type { Opened } from '../../../shared/live/codec'
import {
  applyForm,
  draftProblems,
  EMPTY_DRAFT,
  formsForMe,
  wireDecision,
  type Draft,
} from './decisions'

const frame = (signedBy: 'host' | undefined) =>
  ({ signedBy, payload: { form: WARNING_FORM } }) as unknown as Opened<'decision.form'>

const draft = (values: Record<string, string>, areaId?: string): Draft => ({ values, areaId })
const ID = 'AAAAAAAAAAAAAAAAAAAAAA'

describe('applyForm', () => {
  it('keeps a form the host signed and replaces one with the same id', () => {
    const once = applyForm({}, frame('host'))
    expect(Object.keys(once)).toEqual(['issue-warning'])
    const newer = applyForm(once, {
      signedBy: 'host',
      payload: { form: { ...WARNING_FORM, title: 'Issue a public warning' } },
    } as never)
    expect(newer['issue-warning']!.title).toBe('Issue a public warning')
  })

  it('ignores a form nobody signed', () => {
    expect(applyForm({}, frame(undefined))).toEqual({})
  })
})

describe('formsForMe', () => {
  it('shows a seat only the forms for its role, by title', () => {
    const open = { ...WARNING_FORM, id: 'a-form', title: 'Ask for help', seats: undefined }
    const forms = { [WARNING_FORM.id]: WARNING_FORM, [open.id]: open }
    expect(formsForMe(forms, 'pio').map((f) => f.title)).toEqual([
      'Ask for help',
      'Issue a warning',
    ])
    expect(formsForMe(forms, 'finance').map((f) => f.title)).toEqual(['Ask for help'])
  })
})

describe('draftProblems', () => {
  it('flags required fields, bad times, bad numbers and a missing area', () => {
    expect(draftProblems(WARNING_FORM, EMPTY_DRAFT)).toEqual({
      level: 'Level is required',
      area: 'Area is required',
    })
    expect(
      draftProblems(
        WARNING_FORM,
        draft({ level: 'watch', effective: '9', people: '1.5' }, 'north'),
      ),
    ).toEqual({
      effective: 'Effective at must be H:MM',
      people: 'People affected must be a whole number',
    })
    expect(draftProblems(WARNING_FORM, draft({ level: 'watch', people: 'many' }, 'north'))).toEqual(
      {
        people: 'People affected must be a number',
      },
    )
  })

  it('has no problems for a complete draft', () => {
    expect(draftProblems(WARNING_FORM, draft({ level: 'warning' }, 'harbor'))).toEqual({})
  })
})

describe('wireDecision', () => {
  it('sends numbers as numbers, drops empty fields and carries the picked area', () => {
    const payload = wireDecision(
      WARNING_FORM,
      draft({ level: 'warning', people: ' 40 ', note: '  ', effective: '1:30' }, 'harbor'),
      ID,
    )
    expect(payload).toEqual({
      decisionId: ID,
      formId: 'issue-warning',
      fields: [
        { fieldId: 'level', value: 'warning' },
        { fieldId: 'effective', value: '1:30' },
        { fieldId: 'people', value: 40 },
      ],
      area: { areaId: 'harbor' },
    })
  })
})
