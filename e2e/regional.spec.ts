// Regional exercises (#440): a host project exports a frame, a participant project joins it and
// exports a slice with one private row, the host pins the key, merges and sees the placeholder,
// and a tampered slice is refused. One app, two projects, two organization identities.
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import JSZip from 'jszip'
import { goTo, invoker, launch } from './helpers'

interface Identity {
  orgId: string
  fingerprint: string
}
interface Scn {
  id: string
  msel: Record<string, unknown>[]
  updatedAt: string
}

const row = (id: string, time: string, extra: Record<string, unknown> = {}) => ({
  id,
  phaseId: 'p1',
  time,
  from: 'SimCell',
  toRoleIds: [],
  event: `Event ${id}`,
  expectedAction: `Action ${id}`,
  purposeTag: 'DECISION_POINT',
  citations: [],
  locked: false,
  ...extra,
})

test('regional: frame, join, slice with a private row, pin, merge, tampered slice refused', async () => {
  test.setTimeout(180_000)
  const { app, page } = await launch({ TTX_MOCK_PROVIDERS: '1' })
  const invoke = invoker(page)
  try {
    const work = mkdtempSync(join(tmpdir(), 'ttx-e2e-regional-'))
    let city: Identity
    let air: Identity
    try {
      city = await invoke<Identity>('regional:identity-create', {
        name: 'Cleveland Office of Emergency Management',
        prefix: 'CITY',
      })
      air = await invoke<Identity>('regional:identity-create', {
        name: 'Harborview Airport Authority',
        prefix: 'AIR',
      })
    } catch (e) {
      test.skip(/FORBIDDEN|Secure storage/.test(String(e)), 'The OS keychain is not available here')
      throw e
    }
    const make = async (name: string) => {
      const { path } = await invoke<{ path: string }>('project:create', {
        parentDir: work,
        name,
        orgName: 'Lakefront Regional Planning Group',
        orgType: 'airport',
      })
      const s = await invoke<Scn>('scenarios:create-empty', {
        projectPath: path,
        title: `${name} scenario`,
        brief: {},
      })
      return { path, s }
    }
    const host = await make('Host')
    await invoke('scenarios:save', {
      projectPath: host.path,
      scenario: {
        ...host.s,
        phases: [
          { id: 'p1', index: 0, title: 'Onset', goal: 'g', startTime: '0:00', endTime: '2:00' },
        ],
        msel: [row('START', '0:00'), row('I-01', '0:10')],
      },
    })
    await invoke('regional:create', {
      projectPath: host.path,
      scenarioId: host.s.id,
      hostOrg: 'city',
      orgs: [{ name: 'Harborview Airport Authority', prefix: 'AIR' }],
    })
    const out = mkdtempSync(join(tmpdir(), 'ttx-e2e-bundles-'))
    const frame = join(out, 'frame.asexercise')
    await invoke('regional:export', {
      projectPath: host.path,
      scenarioId: host.s.id,
      kind: 'frame',
      path: frame,
    })

    const guest = await make('Guest')
    const joined = await invoke<{ scenarioId: string }>('regional:join', {
      path: frame,
      projectPath: guest.path,
      orgId: 'air',
      confirmFingerprint: city.fingerprint,
    })
    const scn = await invoke<Scn>('scenarios:get', {
      projectPath: guest.path,
      scenarioId: joined.scenarioId,
    })
    await invoke('scenarios:save', {
      projectPath: guest.path,
      scenario: {
        ...scn,
        msel: [
          ...scn.msel,
          row('I-05', '0:30'),
          row('I-06', '0:40', {
            visibility: 'owner_controllers',
            publicSummary: 'AIR internal escalation inject',
          }),
        ],
      },
    })
    const slice = join(out, 'air.asexercise')
    await invoke('regional:export', {
      projectPath: guest.path,
      scenarioId: joined.scenarioId,
      kind: 'slice',
      path: slice,
    })

    await invoke('regional:pin', {
      projectPath: host.path,
      scenarioId: host.s.id,
      path: slice,
      confirmFingerprint: air.fingerprint,
    })
    const preview = await invoke<{
      orgs: { added: string[]; placeholders: string[]; revision: number }[]
    }>('regional:merge-preview', { projectPath: host.path, scenarioId: host.s.id, paths: [slice] })
    expect(preview.orgs[0]?.added).toEqual(['AIR-I-05', 'AIR-I-06'])
    expect(preview.orgs[0]?.placeholders).toEqual(['AIR-I-06'])
    await invoke('regional:merge-apply', {
      projectPath: host.path,
      scenarioId: host.s.id,
      paths: [slice],
      accept: [{ orgId: 'air', revision: preview.orgs[0]!.revision }],
    })
    const merged = await invoke<Scn>('scenarios:get', {
      projectPath: host.path,
      scenarioId: host.s.id,
    })
    const placeholder = merged.msel.find((r) => r.id === 'AIR-I-06')
    expect(placeholder?.event).toBe('AIR internal escalation inject')
    expect(placeholder?.expectedAction).toBe('')

    const zip = await JSZip.loadAsync(readFileSync(slice))
    zip.file(
      'slices/AIR.json',
      (await zip.file('slices/AIR.json')!.async('string')).replace('Event I-05', 'Event forged'),
    )
    const tampered = join(out, 'tampered.asexercise')
    writeFileSync(tampered, await zip.generateAsync({ type: 'nodebuffer' }))
    await expect(
      invoke('regional:merge-preview', {
        projectPath: host.path,
        scenarioId: host.s.id,
        paths: [tampered],
      }),
    ).rejects.toThrow(/not a valid exercise bundle/)

    // The screen shows the organizations and passes axe.
    await goTo(page, `#/p/${encodeURIComponent(host.path)}/regional`)
    await expect(page.getByRole('heading', { name: 'Regional exercises', level: 1 })).toBeVisible()
    await expect(page.getByText('Hosting this exercise')).toBeVisible()
    const axe = await new AxeBuilder({ page })
      .setLegacyMode(true)
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze()
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([])
  } finally {
    await app.close()
  }
})
