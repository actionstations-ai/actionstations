// Inject type registry (#261): INJECT_TYPES stays built-in; registered types join the lookups.
import { afterEach, describe, expect, it } from 'vitest'
import {
  INJECT_TYPES,
  INJECT_TYPE_IDS,
  injectTypeInfo,
  injectTypes,
  injectTypesForDomain,
  injectTypesRevision,
  isInjectTypeId,
  registerInjectTypes,
  registeredInjectTypes,
  subscribeInjectTypes,
  type InjectTypeInfo,
} from './taxonomy'

const board: InjectTypeInfo = {
  id: 'rail_dispatch_board',
  label: 'Rail dispatch board',
  category: 'operational',
  render: ['template'],
  paper: false,
  mvp: false,
  defaultDelivery: 'display_main_screen',
  domains: ['freight_rail'],
  source: 'pack',
  pack: { id: 'ai.actionstations.freight-rail', version: '1.0.0', name: 'Freight Rail' },
}

afterEach(() => registerInjectTypes([]))

describe('inject type registry', () => {
  it('starts with the built-in list only', () => {
    expect(injectTypes()).toEqual(INJECT_TYPES)
    expect(isInjectTypeId('rail_dispatch_board')).toBe(false)
  })

  it('adds registered types to the lookups and domain filters', () => {
    let calls = 0
    const off = subscribeInjectTypes(() => calls++)
    const rev = injectTypesRevision()
    registerInjectTypes([board])
    off()
    expect(calls).toBe(1)
    expect(injectTypesRevision()).toBe(rev + 1)
    expect(injectTypeInfo('rail_dispatch_board')).toEqual(board)
    expect(isInjectTypeId('rail_dispatch_board')).toBe(true)
    expect(injectTypesForDomain('freight_rail').map((t) => t.id)).toContain('rail_dispatch_board')
    expect(injectTypesForDomain('transit').map((t) => t.id)).not.toContain('rail_dispatch_board')
    expect(INJECT_TYPE_IDS).not.toContain('rail_dispatch_board')
  })

  it('never lets a registered entry shadow a built-in one, nor repeat an id', () => {
    registerInjectTypes([
      { ...board, id: 'tweet', label: 'Pack tweet' },
      board,
      { ...board, label: 'Second' },
      { ...board, id: '../x' },
    ])
    expect(injectTypeInfo('tweet')?.label).toBe('Tweet / X post')
    expect(registeredInjectTypes().map((t) => t.label)).toEqual(['Rail dispatch board'])
  })
})
