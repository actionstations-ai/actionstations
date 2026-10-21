import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'

vi.mock('electron', () => ({ app: { isPackaged: false, getAppPath: () => resolve('.') } }))
process.env.TTX_RESOURCES = resolve('.')
const { composeDocument } = await import('./compose')
const { listTemplateTypes, loadTemplate, validateFields } = await import('./templates')

describe('template composition', () => {
  it('lists shipped templates and skips _shared', () => {
    expect(listTemplateTypes()).toContain('time_jump_card')
    expect(listTemplateTypes().some((t) => t.startsWith('_'))).toBe(false)
  })

  it('every template preview validates against its own schema', () => {
    for (const type of listTemplateTypes()) {
      expect(validateFields(type, loadTemplate(type).preview.fields), type).toEqual([])
    }
  })

  it('reports schema violations with paths', () => {
    const issues = validateFields('time_jump_card', { narration: 1, bogus: true })
    expect(issues.map((i) => i.message).join(' ')).toMatch(/newTime|string|additional/)
  })

  it('escapes untrusted field text, including in nl2br', () => {
    const doc = composeDocument({
      type: 'time_jump_card',
      fields: { newTime: '<img src=x onerror=alert(1)>', narration: 'line 1\n<script>x</script>' },
    })
    expect(doc.html).not.toContain('<img src=x')
    expect(doc.html).not.toContain('<script>x')
    expect(doc.html).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(doc.html).toContain('line 1<br>')
  })

  it('locks the document down with a CSP and bundled fonts only', () => {
    const doc = composeDocument({
      type: 'time_jump_card',
      fields: { newTime: '10:00', narration: 'x' },
    })
    expect(doc.html).toContain("default-src 'none'")
    expect(doc.html).toMatch(
      /url\('file:\/\/.*templates\/_shared\/fonts\/inter-latin-400-normal\.woff2'\)/,
    )
    expect(doc.html).not.toMatch(/https?:\/\//)
  })

  it('rejects path-like template types', () => {
    expect(() => loadTemplate('../etc')).toThrow(/Invalid template type/)
    expect(() => loadTemplate('nope_nope')).toThrow(/No template/)
  })
})
