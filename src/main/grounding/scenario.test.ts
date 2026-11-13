// Grounding a scenario (#423, FR-1/FR-6/FR-8/FR-9): results per item, reused while the
// fingerprint holds, recomputed when the claim, the citations or the cited text change, the
// user's label kept until then, and the warnings the checks list.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { Scenario, type Chunk, type Citation, type Inject, type MselRow } from '@shared/schemas'
import { GROUNDING_VERSION } from './constants'
import { PassageResolver, type GroundingIndex } from './resolve'
import {
  factKeys,
  groundScenario,
  groundingWarnings,
  labelCounts,
  countsLine,
  type GroundingContext,
} from './scenario'

const now = '2026-10-28T12:00:00.000Z'

const CHUNKS: (Chunk & { documentTitle: string })[] = [
  {
    id: 1,
    documentId: 'erp',
    documentTitle: 'Emergency Response Plan',
    headingPath: 'ERP › Section 5 › 5.3 External Reporting Clocks',
    ord: 0,
    text: 'The Water Quality Manager notifies the Ohio EPA district office within 2 hours of a confirmed exceedance.',
    tokenCount: 20,
  },
  {
    id: 2,
    documentId: 'erp',
    documentTitle: 'Emergency Response Plan',
    headingPath: 'ERP › Section 7 › 7.5 Cyber Incident',
    ord: 1,
    text: 'Operators isolate the control network and run the plant in manual. Field readings govern over the screen.',
    tokenCount: 20,
  },
]

function fakeIndex(chunks = CHUNKS): GroundingIndex {
  return {
    chunk: (id) => chunks.find((c) => c.id === id),
    chunks: (documentId) => chunks.filter((c) => c.documentId === documentId),
  }
}

const cite = (c: Chunk & { documentTitle: string }): Citation => ({
  documentId: c.documentId,
  documentTitle: c.documentTitle,
  headingPath: c.headingPath,
  chunkId: c.id,
  quote: c.text.slice(0, 200),
})

const row = (
  id: string,
  expectedAction: string,
  citations: Citation[],
  extra: Partial<MselRow> = {},
): MselRow => ({
  id,
  phaseId: 'p1',
  time: '0:10',
  from: 'Lab',
  toRoleIds: [],
  event: 'Something happens.',
  expectedAction,
  purposeTag: 'CORE_NARRATIVE',
  citations,
  locked: false,
  ...extra,
})

function scenario(msel: MselRow[]): Scenario {
  return Scenario.parse({
    id: 's1',
    projectId: 'p',
    title: 'Test',
    createdAt: now,
    updatedAt: now,
    brief: {},
    roles: [{ id: 'wq', name: 'Water Quality Manager', abbreviation: 'WQ' }],
    msel,
  })
}

const ctx = (index = fakeIndex()): GroundingContext => ({
  index,
  facts: factKeys([], [{ name: 'Water Quality Manager' }]),
  ignore: ['wq', 'WQ'],
  now: () => now,
})

const GOOD =
  'The Water Quality Manager notifies the Ohio EPA district office within 2 hours of the confirmed exceedance.'

describe('groundScenario', () => {
  const s = scenario([
    row('START', 'All roles acknowledge.', [], { purposeTag: 'STARTEX' }),
    row('I-01', GOOD, [cite(CHUNKS[0]!)]),
    row('I-02', 'Operators isolate the control network and run the plant in manual per ERP 7.5.', [
      cite(CHUNKS[1]!),
    ]),
    row('I-03', 'The Director declares a Level 3 condition.', []),
  ])

  it('labels every row: control cards none, the rest from their citations', async () => {
    const g = await groundScenario(s, [], ctx())
    expect(g.items['row:START']!.label).toBe('none')
    expect(g.items['row:I-01']!.label).toBe('grounded')
    expect(g.items['row:I-02']!.label).toBe('grounded')
    expect(g.items['row:I-03']!.label).toBe('unsupported')
    expect(g.items['row:I-01']!.version).toBe(GROUNDING_VERSION)
    expect(countsLine(labelCounts(g.items))).toBe('2 grounded · 0 to review · 1 unsupported')
  })

  it('labels an inject’s controller note against the row’s citations when it has none', async () => {
    const inject = {
      id: 'inj1',
      mselRowId: 'I-01',
      type: 'email',
      title: 'Lab result',
      fields: {},
      instructorNote:
        'Watch that the Water Quality Manager notifies the Ohio EPA district office within 1 hour.',
      citations: [],
      assets: [],
      versions: [],
      deliveryMode: 'hand_to_role',
      includeInDeck: true,
      locked: false,
    } as unknown as Inject
    const g = await groundScenario(s, [inject], ctx())
    expect(g.items['inject:inj1']).toMatchObject({ label: 'unsupported' })
    expect(g.items['inject:inj1']!.reason).toContain('‘1 hour’')
  })

  it('reuses a result while the fingerprint holds and recomputes only the edited row', async () => {
    const first = await groundScenario(s, [], ctx())
    const edited = scenario(
      s.msel.map((r) =>
        r.id === 'I-02' ? { ...r, expectedAction: 'Operators call the vendor.' } : r,
      ),
    )
    edited.grounding = first
    const second = await groundScenario(edited, [], {
      ...ctx(),
      now: () => '2026-10-29T00:00:00.000Z',
    })
    expect(second.items['row:I-01']).toBe(first.items['row:I-01'])
    expect(second.items['row:I-02']!.at).toBe('2026-10-29T00:00:00.000Z')
    expect(second.items['row:I-02']!.fingerprint).not.toBe(first.items['row:I-02']!.fingerprint)
  })

  it('keeps the user’s label until the claim changes', async () => {
    const first = await groundScenario(s, [], ctx())
    const withOverride = { ...s, grounding: { items: { ...first.items } } }
    withOverride.grounding.items['row:I-03'] = {
      ...first.items['row:I-03']!,
      override: { label: 'grounded', note: 'Per the director', at: now },
    }
    const kept = await groundScenario(withOverride, [], ctx())
    expect(kept.items['row:I-03']!.override?.label).toBe('grounded')
    const changed = scenario(
      withOverride.msel.map((r) =>
        r.id === 'I-03'
          ? { ...r, expectedAction: 'The Director declares a Level 2 condition.' }
          : r,
      ),
    )
    changed.grounding = withOverride.grounding
    const fresh = await groundScenario(changed, [], ctx())
    expect(fresh.items['row:I-03']!.override).toBeUndefined()
  })

  it('keeps the user’s label when the index is rebuilt and chunks are renumbered (#1148)', async () => {
    const first = await groundScenario(s, [], ctx())
    const withOverride = { ...s, grounding: { items: { ...first.items } } }
    withOverride.grounding.items['row:I-02'] = {
      ...first.items['row:I-02']!,
      override: { label: 'review', note: 'Check with operations', at: now },
    }
    const renumbered = fakeIndex(CHUNKS.map((c) => ({ ...c, id: c.id + 10 })))
    const after = await groundScenario(withOverride, [], ctx(renumbered))
    expect(after.items['row:I-02']!.fingerprint).toBe(first.items['row:I-02']!.fingerprint)
    expect(after.items['row:I-02']!.override?.note).toBe('Check with operations')
  })

  it('drops the user’s label when the cited passage’s text changes', async () => {
    const first = await groundScenario(s, [], ctx())
    const withOverride = { ...s, grounding: { items: { ...first.items } } }
    withOverride.grounding.items['row:I-02'] = {
      ...first.items['row:I-02']!,
      override: { label: 'review', at: now },
    }
    const edited = fakeIndex(
      CHUNKS.map((c) => (c.id === 2 ? { ...c, text: `${c.text} Call the vendor.` } : c)),
    )
    const after = await groundScenario(withOverride, [], ctx(edited))
    expect(after.items['row:I-02']!.override).toBeUndefined()
  })

  it('carries a label stored under the earlier fingerprint format over to the new one', async () => {
    const first = await groundScenario(s, [], ctx())
    const r = s.msel.find((m) => m.id === 'I-02')!
    const chunk = CHUNKS[1]!
    const legacy = createHash('sha256')
      .update(
        JSON.stringify([
          'row',
          r.expectedAction,
          r.event,
          false,
          [
            [
              chunk.documentId,
              chunk.id,
              [chunk.id, createHash('sha256').update(chunk.text).digest('hex').slice(0, 8)],
            ],
          ],
        ]),
      )
      .digest('hex')
      .slice(0, 16)
    const stored = { ...s, grounding: { items: { ...first.items } } }
    stored.grounding.items['row:I-02'] = {
      ...first.items['row:I-02']!,
      fingerprint: legacy,
      version: 1,
      override: { label: 'review', at: now },
    }
    const after = await groundScenario(stored, [], ctx())
    expect(after.items['row:I-02']!.override?.label).toBe('review')
    expect(after.items['row:I-02']!.fingerprint).toBe(first.items['row:I-02']!.fingerprint)
    expect(after.items['row:I-02']!.version).toBe(GROUNDING_VERSION)
  })

  it('recomputes a result when its cited chunk leaves the index', async () => {
    const first = await groundScenario(s, [], ctx())
    const after = await groundScenario({ ...s, grounding: first }, [], ctx(fakeIndex([CHUNKS[1]!])))
    expect(after.items['row:I-01']!.label).toBe('unsupported')
    expect(after.items['row:I-01']!.reason).toMatch(/no longer in the index/)
  })

  it('lists unsupported rows as warnings and rows to review as tips (FR-9)', async () => {
    const g = await groundScenario(s, [], ctx())
    const warnings = groundingWarnings({ ...s, grounding: g })
    expect(warnings).toEqual([
      expect.objectContaining({
        code: 'GROUNDING_UNSUPPORTED',
        severity: 'warning',
        rowId: 'I-03',
        message: 'Row I-03: No plan passage is cited for this claim.',
      }),
    ])
  })
})

describe('PassageResolver', () => {
  it('finds a citation’s chunk again by its quote when the index was rebuilt in another order', () => {
    const moved = CHUNKS.map((c) => ({ ...c, id: c.id + 10 }))
    const resolver = new PassageResolver(fakeIndex(moved))
    expect(resolver.resolve(cite(CHUNKS[1]!))?.chunkId).toBe(12)
  })

  it('treats a chunk id now used by another document as missing', () => {
    const other = [{ ...CHUNKS[0]!, documentId: 'tirp' }]
    expect(new PassageResolver(fakeIndex(other)).resolve(cite(CHUNKS[0]!))).toBeUndefined()
  })
})
