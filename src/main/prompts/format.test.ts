import { describe, expect, it } from 'vitest'
import { hashRaw, parsePromptRaw, splitSections, type PromptIssue } from './format'

const fm = (extra = '') => `---\nname: demo\nstage: msel_phase\n${extra}---\n`
const body = '<!-- @system -->\nSys {{a}}\n<!-- @user -->\nUser {{b}}\n'

function issuesOf(raw: string, name = 'demo'): PromptIssue[] {
  try {
    parsePromptRaw(raw, name, 'demo.md')
  } catch (err) {
    return (err as { details: PromptIssue[] }).details
  }
  throw new Error('expected a validation error')
}

describe('splitSections', () => {
  it('drops text before the first marker and records file lines', () => {
    const s = splitSections(
      'notes\n\n<!-- @system -->\n\nA\n<!-- @context -->\nC\n<!-- @user -->\nU',
      5,
    )
    expect(s.system).toEqual({ text: 'A', markerLine: 7, startLine: 9 })
    expect(s.context?.text).toBe('C')
    expect(s.user?.text).toBe('U')
    expect(JSON.stringify(s)).not.toContain('notes')
  })

  it('accepts markers with surrounding whitespace and CRLF line endings', () => {
    const s = splitSections('  <!--   @system   -->  \r\nA\r\n<!--@user-->\r\nB')
    expect(s.system?.text).toBe('A')
    expect(s.user?.text).toBe('B')
  })

  it('reports unknown and duplicate markers', () => {
    const issues: PromptIssue[] = []
    splitSections('<!-- @system -->\nA\n<!-- @sytem -->\n<!-- @system -->\nB', 1, issues)
    expect(issues).toEqual([
      { line: 3, message: 'unknown section marker "@sytem"' },
      { line: 4, message: 'duplicate section marker "@system"' },
    ])
  })
})

describe('parsePromptRaw', () => {
  it('parses frontmatter with defaults and the body', () => {
    const p = parsePromptRaw(fm() + body, 'demo', 'demo.md')
    expect(p.frontmatter).toMatchObject({
      name: 'demo',
      stage: 'msel_phase',
      version: 1,
      task: 'draft',
    })
    expect(p.sections.system?.text).toBe('Sys {{a}}')
    expect(p.sections.user?.startLine).toBe(8)
  })

  it('requires @system and @user', () => {
    const issues = issuesOf(fm() + '<!-- @system -->\nOnly system\n')
    expect(issues.map((i) => i.message)).toEqual(['missing required section marker <!-- @user -->'])
  })

  it('names the file in the error message', () => {
    expect(() => parsePromptRaw(fm() + 'no markers', 'demo', 'global override demo.md')).toThrow(
      /Invalid prompt global override demo\.md: line \d+: missing required section marker <!-- @system -->/,
    )
  })

  it('rejects a name that differs from the file stem, on the name line', () => {
    expect(issuesOf(fm() + body, 'other')).toEqual([
      { line: 2, message: 'name "demo" must equal the file name "other"' },
    ])
  })

  it('reports schema errors on the offending frontmatter line', () => {
    const raw = `---\nname: demo\nstage: msel_phase\nversion: zero\n---\n${body}`
    const [issue] = issuesOf(raw)
    expect(issue?.line).toBe(4)
    expect(issue?.message).toMatch(/^version:/)
  })

  it('rejects a stage outside STAGES', () => {
    const [issue] = issuesOf(`---\nname: demo\nstage: brainstorm\n---\n${body}`)
    expect(issue).toMatchObject({ line: 3 })
    expect(issue?.message).toMatch(/^stage:/)
  })

  it('reports YAML syntax errors with a line', () => {
    const [issue] = issuesOf(`---\nname: demo\nstage: [msel_phase\n---\n${body}`)
    expect(issue?.message).toMatch(/^YAML frontmatter:/)
    expect(issue?.line).toBeGreaterThanOrEqual(3)
  })

  it('requires frontmatter', () => {
    expect(issuesOf(body)).toEqual([
      { line: 1, message: 'missing YAML frontmatter (file must start with ---)' },
    ])
  })

  it('rejects unknown helpers at compile time with the file line', () => {
    const raw = fm() + '<!-- @system -->\nok\n<!-- @user -->\nline one\n{{shout name}}\n'
    expect(issuesOf(raw)).toEqual([{ line: 9, message: 'unknown helper "shout"' }])
  })

  it('reports Handlebars syntax errors with the file line', () => {
    const raw = fm() + '<!-- @system -->\n\nfirst\n{{#each items}}\n<!-- @user -->\nU\n'
    const [issue] = issuesOf(raw)
    expect(issue?.line).toBeGreaterThanOrEqual(6)
    expect(issue?.message).toMatch(/Parse error|each/)
  })

  it('reports an empty required section on its marker line', () => {
    expect(issuesOf(fm() + '<!-- @system -->\n\n<!-- @user -->\nU\n')).toEqual([
      { line: 5, message: 'section @system is empty' },
    ])
  })
})

describe('hashRaw', () => {
  it('is a stable sha256 hex digest of the exact text', () => {
    expect(hashRaw('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(hashRaw('abc\n')).not.toBe(hashRaw('abc'))
  })
})
