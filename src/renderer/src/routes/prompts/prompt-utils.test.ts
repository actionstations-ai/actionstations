import { describe, expect, it } from 'vitest'
import type { PromptEntry } from '@shared/schemas/prompt'
import {
  basePhrase,
  diffStats,
  firstPromptName,
  groupByStage,
  insertIndent,
  issuesFrom,
  layerBelow,
  lineDiff,
  offsetOfLine,
  startingText,
} from './prompt-utils'

const entry = (name: string, stage: PromptEntry['stage']): PromptEntry => ({
  name,
  stage,
  effectiveSource: 'default',
  hasGlobalOverride: false,
  hasProjectOverride: false,
  hasPackLayer: false,
})

describe('layers', () => {
  const raw = { default: 'D', global: 'G', project: 'P' }
  it('global scope compares against the default', () => {
    expect(layerBelow('global', raw)).toEqual({ layer: 'default', text: 'D' })
    expect(startingText('global', raw)).toBe('G')
    expect(startingText('global', { default: 'D' })).toBe('D')
  })
  it('project scope compares against the global override when there is one', () => {
    expect(layerBelow('project', raw)).toEqual({ layer: 'global', text: 'G' })
    expect(layerBelow('project', { default: 'D' })).toEqual({ layer: 'default', text: 'D' })
    expect(startingText('project', raw)).toBe('P')
    expect(startingText('project', { default: 'D', global: 'G' })).toBe('G')
  })
})

describe('pack layer (#262)', () => {
  it('sits between the global override and the default', () => {
    const raw = { default: 'D', pack: 'K' }
    expect(layerBelow('global', raw)).toEqual({ layer: 'pack', text: 'K' })
    expect(layerBelow('project', raw)).toEqual({ layer: 'pack', text: 'K' })
    expect(layerBelow('project', { ...raw, global: 'G' })).toEqual({ layer: 'global', text: 'G' })
    expect(startingText('global', raw)).toBe('K')
  })
  it('names the pack in labels', () => {
    expect(basePhrase('pack', 'Freight Rail')).toBe('Freight Rail pack')
    expect(basePhrase('global')).toBe('global override')
  })
})

describe('groupByStage', () => {
  it('orders groups by pipeline stage and names within a group', () => {
    const groups = groupByStage([
      entry('critique', 'critique'),
      entry('msel_b', 'msel_phase'),
      entry('msel_a', 'msel_phase'),
      entry('ideate', 'ideate'),
    ])
    expect(groups.map((g) => [g.stage, g.entries.map((e) => e.name)])).toEqual([
      ['ideate', ['ideate']],
      ['msel_phase', ['msel_a', 'msel_b']],
      ['critique', ['critique']],
    ])
  })

  it('defaults to the first item of the first group, not the first entry (#231)', () => {
    const entries = [
      entry('controller_handbook', 'controller_handbook'),
      entry('ideate_b', 'ideate'),
      entry('ideate_a', 'ideate'),
    ]
    expect(firstPromptName(entries)).toBe('ideate_a')
    expect(firstPromptName([])).toBeUndefined()
  })
})

describe('lineDiff', () => {
  it('marks added, removed and unchanged lines', () => {
    const lines = lineDiff('a\nb\nc', 'a\nB\nc\nd')
    expect(lines).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'B' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ])
    expect(diffStats(lineDiff('a\nb', 'a\nb'))).toEqual({ added: 0, removed: 0 })
    expect(diffStats(lineDiff('a\nb', 'a\nB\nC'))).toEqual({ added: 2, removed: 1 })
  })
})

describe('editor helpers', () => {
  it('insertIndent replaces the selection with two spaces', () => {
    expect(insertIndent('abcd', 1, 3)).toEqual({ value: 'a  d', caret: 3 })
  })
  it('offsetOfLine finds line starts', () => {
    expect(offsetOfLine('ab\ncd\nef', 1)).toBe(0)
    expect(offsetOfLine('ab\ncd\nef', 3)).toBe(6)
    expect(offsetOfLine('ab', 9)).toBe(2)
  })
  it('issuesFrom keeps well-formed issues only', () => {
    expect(issuesFrom([{ line: 3, message: 'x' }, { line: 'a' }, null])).toEqual([
      { line: 3, message: 'x' },
    ])
    expect(issuesFrom(undefined)).toEqual([])
  })
})
