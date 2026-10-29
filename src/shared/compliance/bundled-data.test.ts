// The bundled regulations and frameworks (packs/regulations, packs/frameworks): valid, their
// cross-references resolve, and their "last checked" dates are recent (spec 0426 FR-16).
import { describe, expect, it } from 'vitest'
import { Framework, Regulation, splitControlRef } from '@shared/schemas/compliance'

const load = (files: Record<string, unknown>) =>
  Object.entries(files).map(([path, raw]) => ({
    file: path.slice(path.lastIndexOf('/') + 1, -'.json'.length),
    raw,
  }))

const regulationFiles = load(
  import.meta.glob<unknown>('../../../packs/regulations/*.json', {
    eager: true,
    import: 'default',
  }),
)
const frameworkFiles = load(
  import.meta.glob<unknown>('../../../packs/frameworks/*.json', { eager: true, import: 'default' }),
)
const regulations = regulationFiles.map((f) => ({ ...f, reg: Regulation.parse(f.raw) }))
const frameworks = new Map(frameworkFiles.map((f) => [f.file, Framework.parse(f.raw)]))

/** Re-check every deadline and catalog at least once a year (each release). */
const MAX_AGE_MONTHS = 12

function monthsSince(isoDate: string, today: Date): number {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const months = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m)
  return today.getDate() < d ? months - 1 : months
}

describe('bundled regulations', () => {
  it('ships the regulations of spec 0426 §5', () => {
    expect(regulations.map((r) => r.reg.id).sort()).toEqual([
      'circia',
      'dora_art19',
      'gdpr_art33',
      'hipaa_breach',
      'nis2_art23',
      'sec_8k_105',
      'tsa_aviation_cyber',
      'tsa_pipeline_cyber',
      'tsa_rail_cyber',
    ])
  })

  it.each(regulations.map((r) => [r.file, r] as const))(
    '%s: file name equals its id',
    (file, r) => {
      expect(r.reg.id).toBe(file)
    },
  )

  it('labels CIRCIA as a proposed rule', () => {
    expect(regulations.find((r) => r.reg.id === 'circia')?.reg.status).toBe('proposed')
  })

  it('SEC 8-K counts 4 business days on the US federal calendar', () => {
    const sec = regulations.find((r) => r.reg.id === 'sec_8k_105')!.reg
    expect(sec.calendar).toBe('us_federal')
    expect(sec.clocks[0]!.dueAt).toEqual([
      { from: 'materiality_determined', amount: 4, unit: 'business_days' },
    ])
  })

  it('every control a regulation lists exists in a bundled framework', () => {
    for (const { reg } of regulations)
      for (const ref of reg.controls) {
        const { frameworkId, controlId } = splitControlRef(ref)
        const f = frameworks.get(frameworkId)
        expect(f, `${reg.id}: ${ref}`).toBeDefined()
        expect(
          f!.controls.some((c) => c.id === controlId),
          `${reg.id}: ${ref}`,
        ).toBe(true)
      }
  })

  it('every regulation trigger a framework rule names exists', () => {
    for (const f of frameworks.values())
      for (const rule of f.rules)
        for (const t of rule.triggers) {
          if (t === '*:*') continue
          const [regId, triggerId] = t.split(':')
          const reg = regulations.find((r) => r.reg.id === regId)?.reg
          expect(reg, `${f.id}: ${t}`).toBeDefined()
          expect(
            triggerId === '*' || reg!.triggers.some((x) => x.id === triggerId),
            `${f.id}: ${t}`,
          ).toBe(true)
        }
  })
})

describe('last-checked dates', () => {
  const today = new Date()
  const records = [
    ...regulations.map((r) => [`regulations/${r.file}`, r.reg.verifiedOn] as const),
    ...[...frameworks.values()].map((f) => [`frameworks/${f.id}`, f.verifiedOn] as const),
  ]
  it.each(records)(
    `%s was checked within the last ${MAX_AGE_MONTHS} months (re-check its sources and update verifiedOn)`,
    (_name, verifiedOn) => {
      expect(monthsSince(verifiedOn, today)).toBeLessThan(MAX_AGE_MONTHS)
    },
  )

  it('the age check counts whole months', () => {
    expect(monthsSince('2026-10-28', new Date(2027, 9, 27))).toBe(11)
    expect(monthsSince('2026-10-28', new Date(2027, 9, 28))).toBe(12)
  })
})
