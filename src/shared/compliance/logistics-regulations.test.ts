// The food traceability and recall regulation entries (#819): they parse, the clocks compute the
// terms the rule states, the status notes carry the facts that are easy to get wrong, and the
// logistics library pins public-domain documents.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Regulation } from '@shared/schemas/compliance'
import { deadline } from './clock'

const ROOT = join(__dirname, '../../..')
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'))
const fsma = Regulation.parse(read('packs/regulations/fsma_204_records.json'))
const recall = Regulation.parse(read('packs/regulations/fda_recall_reporting.json'))

const anchors = (trigger: string, at: Date, completions: Record<string, Date> = {}) => ({
  triggers: new Map([[trigger, at]]),
  completions: new Map(
    Object.entries(completions).map(([k, v]) => [
      k,
      { status: 'met' as const, note: '', atDate: v },
    ]),
  ),
})

describe('fsma_204_records', () => {
  it('gives FDA 24 hours from the request', () => {
    const at = new Date('2026-11-05T17:10:00')
    const d = deadline(fsma, 'records_available', anchors('fda_request_received', at))
    expect('dueAt' in d && d.dueAt.getTime() - at.getTime()).toBe(24 * 3_600_000)
  })

  it('states both compliance dates and the enforcement direction', () => {
    expect(fsma.status).toBe('in_force')
    expect(fsma.statusNote).toContain('2026-01-20')
    expect(fsma.statusNote).toContain('2028-07-20')
    expect(fsma.statusNote).toMatch(/not to enforce/)
    expect(fsma.clocks[0]!.rule).toMatch(/electronic sortable spreadsheet/)
  })

  it('names templates that exist', () => {
    for (const t of fsma.clocks.flatMap((c) => c.injectTypes))
      expect(
        JSON.parse(readFileSync(join(ROOT, `templates/injects/${t}/meta.json`), 'utf8')).type,
      ).toBe(t)
  })
})

describe('fda_recall_reporting', () => {
  it('is guidance, not a requirement', () => {
    expect(recall.status).toBe('guidance')
    expect(recall.statusNote).toMatch(/need not wait for FDA/)
  })

  it('counts the first status report from the consignee notice', () => {
    const decided = new Date('2026-11-05T09:00:00')
    const notice = deadline(recall, 'consignee_notice', anchors('recall_decision', decided))
    expect('dueAt' in notice && notice.dueAt.getTime() - decided.getTime()).toBe(24 * 3_600_000)
    const sent = new Date('2026-11-05T15:00:00')
    const report = deadline(
      recall,
      'status_report',
      anchors('recall_decision', decided, { consignee_notice: sent }),
    )
    expect('dueAt' in report && report.dueAt.getTime() - sent.getTime()).toBe(14 * 86_400_000)
  })

  it('says the planning terms are not numbers in the regulation', () => {
    expect(recall.clocks.map((c) => c.rule).join(' ')).toMatch(/planning/)
  })
})

describe('logistics library', () => {
  const manifest = read('packs/documents/manifest.json') as {
    libraries: Record<string, { domain: string }>
    documents: {
      pack: string
      slug: string
      sha256: string | null
      size: number | null
      license: string
      basis: string
      url: string
    }[]
  }
  const docs = manifest.documents.filter((d) => d.pack === 'logistics-library')

  it('is a library for the supply chain domain with pinned public-domain documents', () => {
    expect(manifest.libraries['logistics-library']?.domain).toBe('supply_chain')
    expect(docs.map((d) => d.slug).sort()).toEqual([
      'cfr-title-21-part-7-recalls',
      'fsma-204-traceability-final-rule',
    ])
    for (const d of docs) {
      expect(d.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(d.size).toBeGreaterThan(0)
      expect(d.license).toBe('LicenseRef-US-Government-Work')
      expect(d.basis).toMatch(/17 U\.S\.C\./)
      expect(new URL(d.url).host).toBe('www.govinfo.gov')
    }
  })

  it('is named by the toolkit with the same ids', () => {
    const toolkit = read('packs/toolkits/logistics.json') as {
      documents: { packId: string; documentId: string }[]
    }
    expect(toolkit.documents.map((d) => d.documentId).sort()).toEqual(
      docs.map((d) => d.slug).sort(),
    )
    for (const d of toolkit.documents) expect(d.packId).toBe('ai.actionstations.logistics-library')
  })
})

describe('domains using the regulations', () => {
  it('lists them on the supply chain and food and agriculture profiles', () => {
    for (const id of ['supply_chain', 'food_agriculture'])
      expect(read(`packs/domains/${id}.json`).regulations).toEqual(
        expect.arrayContaining(['fsma_204_records', 'fda_recall_reporting']),
      )
  })
})
