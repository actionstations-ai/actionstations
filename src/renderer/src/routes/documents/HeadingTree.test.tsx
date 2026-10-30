// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import { buildHeadingTree, redlineCountsByHeading } from './doc-utils'
import { HeadingTree } from './HeadingTree'

afterEach(cleanup)

const redlines = [
  { status: 'proposed', target: { headingPath: 'Section 6 › 6.4 Public Information' } },
  { status: 'accepted', target: { headingPath: 'Section 6 › 6.4 Public Information' } },
  { status: 'rejected', target: { headingPath: 'Section 6 › 6.5 Shelters' } },
  { status: 'proposed', target: { headingPath: 'Section 9' } },
]

describe('redlineCountsByHeading (#504)', () => {
  it('counts a proposal for its heading and the headings above it, not rejected ones', () => {
    const counts = redlineCountsByHeading(redlines)
    expect(counts.get('Section 6')).toBe(2)
    expect(counts.get('Section 6 › 6.4 Public Information')).toBe(2)
    expect(counts.get('Section 6 › 6.5 Shelters')).toBeUndefined()
    expect(counts.get('Section 9')).toBe(1)
  })
})

describe('HeadingTree with proposed changes', () => {
  const tree = buildHeadingTree(['Section 6', 'Section 6 › 6.4 Public Information', 'Section 9'])

  it('shows a count next to each heading that has proposals, in words', () => {
    render(<HeadingTree nodes={tree} label="Headings" counts={redlineCountsByHeading(redlines)} />)
    expect(screen.getAllByText('2 proposed changes')).toHaveLength(2)
    expect(screen.getByText('1 proposed change')).toBeTruthy()
  })

  it('has no axe violations', async () => {
    render(<HeadingTree nodes={tree} label="Headings" counts={redlineCountsByHeading(redlines)} />)
    const result = await axe.run(document.body, {
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    })
    expect(result.violations.map((v) => v.id)).toEqual([])
  })
})
