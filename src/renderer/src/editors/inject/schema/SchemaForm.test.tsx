// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import fidsSchema from '../../../../../../templates/injects/fids_board/schema.json'
import tweetSchema from '../../../../../../templates/injects/tweet/schema.json'
import chatSchema from '../../../../../../templates/injects/chat_transcript/schema.json'
import { formFromSchema, type JsonSchema } from './fields'
import { SchemaForm } from './SchemaForm'
import { issuesByPath, validateFields } from './validate'

afterEach(() => cleanup())

function Harness(props: {
  schema: JsonSchema
  initial: Record<string, unknown>
  out: { value?: Record<string, unknown> }
}) {
  const [value, setValue] = useState(props.initial)
  const spec = formFromSchema(props.schema)
  const { out } = props
  return (
    <SchemaForm
      spec={spec}
      value={value}
      issues={issuesByPath(validateFields(props.schema, value))}
      onChange={(v) => {
        Object.assign(out, { value: v })
        setValue(v)
      }}
    />
  )
}

describe('SchemaForm', () => {
  it('tweet: labelled controls, descriptions as hints, character counter, inline errors', async () => {
    const out: { value?: Record<string, unknown> } = {}
    render(
      <Harness
        schema={tweetSchema as JsonSchema}
        initial={{ displayName: 'Travel Guy', handle: 'TravelGuy99', text: '' }}
        out={out}
      />,
    )
    const text = screen.getByLabelText('Text *')
    expect(text.tagName).toBe('TEXTAREA')
    await userEvent.type(text, 'Boards are wrong #NCIA')
    expect(out.value?.text).toBe('Boards are wrong #NCIA')
    expect(screen.getByText('22/560')).toBeTruthy()
    const handle = screen.getByLabelText('Handle *')
    expect(handle.getAttribute('aria-describedby')).toBeTruthy()
    await userEvent.clear(handle)
    await userEvent.type(handle, 'bad handle!')
    expect(screen.getByText('Does not match the expected format')).toBeTruthy()
    await userEvent.selectOptions(screen.getByLabelText('Avatar style'), 'initials')
    expect(out.value?.avatarStyle).toBe('initials')
    const likes = screen.getByLabelText('Likes')
    await userEvent.type(likes, '45')
    expect(out.value?.metrics).toEqual({ likes: 45 })
  })

  it('optional fields are removed when cleared, so empty strings never fail a pattern', async () => {
    const out: { value?: Record<string, unknown> } = {}
    render(
      <Harness
        schema={tweetSchema as JsonSchema}
        initial={{ displayName: 'a', handle: 'a', text: 'a', timestampRel: '4m' }}
        out={out}
      />,
    )
    await userEvent.clear(screen.getByLabelText('Timestamp rel'))
    expect(out.value).not.toHaveProperty('timestampRel')
  })

  it('fids rows: table row editor adds, edits, moves and removes rows', async () => {
    const out: { value?: Record<string, unknown> } = {}
    const first = { time: '10:20', dest: 'ATLANTA', flight: 'DL 1245', status: 'ON TIME' }
    render(<Harness schema={fidsSchema as JsonSchema} initial={{ rows: [first] }} out={out} />)
    const group = screen.getByRole('group', { name: /Rows/ })
    await userEvent.click(within(group).getByRole('button', { name: 'Add row' }))
    const dest2 = screen.getByLabelText('Rows 2: Dest')
    expect(document.activeElement).toBe(screen.getByLabelText('Rows 2: Time'))
    await userEvent.type(dest2, 'PURGATORY')
    expect((out.value?.rows as unknown[])[1]).toMatchObject({ dest: 'PURGATORY', flight: '' })
    await userEvent.click(screen.getByRole('button', { name: 'Move row 2 up' }))
    expect((out.value?.rows as { dest: string }[]).map((r) => r.dest)).toEqual([
      'PURGATORY',
      'ATLANTA',
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Remove row 1' }))
    expect(out.value?.rows).toEqual([first])
    // minItems 1: the last row cannot be removed.
    expect(
      (screen.getByRole('button', { name: 'Remove row 1' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    await userEvent.click(screen.getByLabelText('Rows 1: Anomaly'))
    expect((out.value?.rows as { anomaly?: boolean }[])[0]?.anomaly).toBe(true)
  })

  it('chat transcript: string list and message cards', async () => {
    const out: { value?: Record<string, unknown> } = {}
    render(<Harness schema={chatSchema as JsonSchema} initial={{}} out={out} />)
    const participants = screen.getByRole('group', { name: /Participants/ })
    await userEvent.click(within(participants).getByRole('button', { name: /Add participant/ }))
    await userEvent.type(screen.getByLabelText('Participants 1'), 'Karen Smith')
    expect(out.value?.participants).toEqual(['Karen Smith'])
    const messages = screen.getByRole('group', { name: /Messages/ })
    await userEvent.click(within(messages).getByRole('button', { name: /Add message/ }))
    expect(screen.getByRole('group', { name: 'Message 1' })).toBeTruthy()
  })
})
