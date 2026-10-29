// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryClient } from '../../lib/query'
import { mockTtx } from '../../routes/documents/test-utils'
import { fieldRows, getAtPath, setAtPath } from './fields'
import { TranslationEditor } from './TranslationEditor'

afterEach(() => cleanup())

const base = { projectPath: '/tmp/p.asproj', scenarioId: 'S1', lang: 'es' as const }

function renderEditor(
  item: { kind: 'doc'; id: 'briefing' } | { kind: 'inject'; id: string },
  extra: Partial<Parameters<typeof TranslationEditor>[0]> = {},
) {
  queryClient.clear()
  const props = { onNext: vi.fn(), onClose: vi.fn(), onSaved: vi.fn(), hasNext: true, ...extra }
  render(
    <QueryClientProvider client={queryClient}>
      <TranslationEditor {...base} item={item} {...props} />
    </QueryClientProvider>,
  )
  return props
}

describe('translation fields', () => {
  const value = { text: 'Hi', contact: { note: 'Call' }, bubbles: [{ text: 'a' }, { text: 'b' }] }

  it('lists every string with a readable label and path', () => {
    expect(fieldRows(value).map((r) => [r.label, r.value])).toEqual([
      ['Text', 'Hi'],
      ['Contact › Note', 'Call'],
      ['Bubbles 1 › Text', 'a'],
      ['Bubbles 2 › Text', 'b'],
    ])
  })

  it('writes an edit back at the same path without touching the rest', () => {
    const next = setAtPath(value, ['bubbles', 1, 'text'], 'B') as typeof value
    expect(next.bubbles).toEqual([{ text: 'a' }, { text: 'B' }])
    expect(next.contact).toBe(value.contact)
    expect(getAtPath(next, ['bubbles', 1, 'text'])).toBe('B')
    expect(getAtPath(next, ['nope', 1])).toBeUndefined()
  })
})

describe('TranslationEditor (spec 0435 FR-8)', () => {
  it('shows the English read-only and the Spanish editable, each marked with its language', async () => {
    mockTtx({
      'translate:get-item': () => ({
        kind: 'doc',
        id: 'briefing',
        label: 'Player Briefing Packet',
        status: 'machine',
        flags: ['Expected "EJERCICIO" for "EXERCISE"'],
        source: 'An EXERCISE.',
        translated: 'Un ejercicio.',
      }),
    })
    renderEditor({ kind: 'doc', id: 'briefing' })
    const en = (await screen.findByLabelText('English (original)')) as HTMLTextAreaElement
    const es = screen.getByLabelText('Spanish (edit here)') as HTMLTextAreaElement
    expect(en.readOnly).toBe(true)
    expect(en.getAttribute('lang')).toBe('en')
    expect(es.readOnly).toBe(false)
    expect(es.getAttribute('lang')).toBe('es')
    expect(screen.getByRole('list', { name: 'Glossary hints' }).textContent).toContain('EJERCICIO')
    expect(screen.getByText('Machine translation, not reviewed')).toBeTruthy()
  })

  it('saves an edited document as reviewed', async () => {
    const ttx = mockTtx({
      'translate:get-item': () => ({
        kind: 'doc',
        id: 'briefing',
        label: 'Player Briefing Packet',
        status: 'machine',
        flags: [],
        source: 'Hello',
        translated: 'Hola',
      }),
      'translate:save-item': () => undefined,
    })
    const props = renderEditor({ kind: 'doc', id: 'briefing' })
    const es = await screen.findByLabelText('Spanish (edit here)')
    await userEvent.clear(es)
    await userEvent.type(es, 'Hola a todos')
    await userEvent.click(screen.getByRole('button', { name: 'Save and mark reviewed' }))
    await waitFor(() => expect(ttx.calls('translate:save-item')).toHaveLength(1))
    expect(ttx.calls('translate:save-item')[0]).toMatchObject({
      ...base,
      item: { kind: 'doc', id: 'briefing' },
      markdown: 'Hola a todos',
    })
    await waitFor(() => expect(props.onSaved).toHaveBeenCalled())
    expect(props.onNext).not.toHaveBeenCalled()
  })

  it('edits an inject field by field and Ctrl+Enter saves and moves on', async () => {
    const ttx = mockTtx({
      'translate:get-item': () => ({
        kind: 'inject',
        id: 'i1',
        label: 'I-04: Post',
        status: 'machine',
        flags: [],
        sourceTitle: 'Post',
        sourceFields: { text: 'Boil water.', bubbles: [{ text: 'Is it safe?' }] },
        translatedTitle: 'Publicación',
        translatedFields: { text: 'Hierva el agua.', bubbles: [{ text: '¿Es seguro?' }] },
      }),
      'translate:save-item': () => undefined,
    })
    const props = renderEditor({ kind: 'inject', id: 'i1' })
    const text = await screen.findByLabelText('Text (Spanish)')
    expect(screen.getByLabelText('Bubbles 1 › Text (English)')).toBeTruthy()
    await userEvent.clear(text)
    await userEvent.type(text, 'Hierva el agua antes de beberla.')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(ttx.calls('translate:save-item')).toHaveLength(1))
    expect(ttx.calls('translate:save-item')[0]).toMatchObject({
      item: { kind: 'inject', id: 'i1' },
      title: 'Publicación',
      fields: { text: 'Hierva el agua antes de beberla.', bubbles: [{ text: '¿Es seguro?' }] },
    })
    await waitFor(() => expect(props.onNext).toHaveBeenCalled())
  })

  it('shows the error when saving fails and keeps the edit', async () => {
    mockTtx({
      'translate:get-item': () => ({
        kind: 'doc',
        id: 'briefing',
        label: 'Player Briefing Packet',
        status: 'machine',
        flags: [],
        source: 'a',
        translated: 'b',
      }),
      'translate:save-item': () => {
        throw new Error('Disk is full')
      },
    })
    renderEditor({ kind: 'doc', id: 'briefing' })
    await screen.findByLabelText('Spanish (edit here)')
    await userEvent.click(screen.getByRole('button', { name: 'Save and mark reviewed' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Disk is full')
  })
})
