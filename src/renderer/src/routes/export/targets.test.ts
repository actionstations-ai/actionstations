import { describe, expect, it } from 'vitest'
import { ALL_TARGETS, DEFAULT_TARGETS, asExportResult, toggleTarget } from './targets'

describe('export targets', () => {
  it('defaults to everything except the optional Word files', () => {
    expect(DEFAULT_TARGETS).not.toContain('docx')
    expect(DEFAULT_TARGETS).toContain('zip')
    expect(ALL_TARGETS).toHaveLength(25)
    expect(DEFAULT_TARGETS).toContain('aar_pdf')
    expect(DEFAULT_TARGETS).not.toContain('coverage_xlsx')
    for (const t of ['conducttr_csv', 'eoc_package', 'cap_xml'] as const)
      expect(DEFAULT_TARGETS).not.toContain(t)
    expect(DEFAULT_TARGETS).toContain('surveys_pdf')
  })

  it('selects the HSEEP set by default (#420)', () => {
    for (const t of ['explan_pdf', 'sitman_pdf', 'handbook_hseep_pdf', 'msel_xlsx'] as const)
      expect(DEFAULT_TARGETS).toContain(t)
  })

  it('toggles a target and keeps the canonical order', () => {
    expect(toggleTarget(['zip', 'msel_pdf'], 'docx')).toEqual(['msel_pdf', 'docx', 'zip'])
    expect(toggleTarget(['msel_pdf'], 'explan_pdf')).toEqual(['explan_pdf', 'msel_pdf'])
    expect(toggleTarget(['msel_pdf', 'zip'], 'zip')).toEqual(['msel_pdf'])
  })

  it('reads the job result defensively', () => {
    expect(asExportResult(undefined)).toBeNull()
    expect(asExportResult({ folder: 1 })).toBeNull()
    expect(asExportResult({ folder: '/out/X', files: ['a', 2], zipPath: '/out/X.zip' })).toEqual({
      folder: '/out/X',
      zipPath: '/out/X.zip',
      files: ['a'],
      warnings: [],
    })
  })
})
