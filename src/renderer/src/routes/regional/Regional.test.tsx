// @vitest-environment happy-dom
// Regional exercises (#440): the screens have no axe violations, a fingerprint is read in groups,
// the owner and review states are words, and nothing is pinned until a fingerprint is typed.
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach, describe, expect, it } from 'vitest'
import type { BundleSummary, ExportReview, MergePreviewView } from '@shared/ipc/regional'
import { mockTtx, renderAt, PROJECT } from '../documents/test-utils'
import { BundleReview } from './BundleReview'
import { ExportReviewPanel } from './ExportReviewPanel'
import { MergeReview } from './MergeReview'
import RegionalPage from './RegionalPage'

afterEach(cleanup)

const AXE = { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } }
const violations = async () => (await axe.run(document.body, AXE)).violations.map((v) => v.id)

const FP = 'a1b2 c3d4 e5f6 0718 293a 4b5c 6d7e 8f90'
const summary: BundleSummary = {
  kind: 'slice',
  exerciseId: '01J8ZQ4F7M3N5P6R7S8T9V0W1X',
  title: 'Lakefront Regional Tabletop',
  final: false,
  frameVersion: 1,
  createdAt: '2026-03-01T10:00:00.000Z',
  from: { orgId: 'air', name: 'Harborview Airport Authority', prefix: 'AIR', fingerprint: FP },
  orgs: [],
  slices: [{ orgId: 'air', revision: 2, rows: 5, privateRows: 1, injects: 4, proposals: 0 }],
  mediaFiles: 3,
  pin: 'new',
}

describe('BundleReview', () => {
  it('reads the fingerprint in groups and pins only after a fingerprint is typed', async () => {
    mockTtx({})
    const seen: string[] = []
    renderAt('/x', '/x', () => (
      <BundleReview summary={summary} confirmLabel="Pin this key" onConfirm={(f) => seen.push(f)} />
    ))
    expect(screen.getByText('a1b2, c3d4, e5f6, 0718, 293a, 4b5c, 6d7e, 8f90')).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Pin this key' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Fingerprint from the sender'), {
      target: { value: FP },
    })
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    expect(seen).toEqual([FP])
    expect(await violations()).toEqual([])
  })

  it('offers no pin for an organization outside the exercise', () => {
    mockTtx({})
    renderAt('/x', '/x', () => (
      <BundleReview
        summary={{ ...summary, pin: 'unknown_org' }}
        confirmLabel="Pin"
        onConfirm={() => {}}
      />
    ))
    expect(screen.queryByRole('button', { name: 'Pin' })).toBeNull()
    expect(screen.getByText(/not part of the exercise/)).toBeTruthy()
  })
})

describe('ExportReviewPanel', () => {
  const review: ExportReview = {
    kind: 'slice',
    files: [{ path: 'slices/AIR.json', size: 2048 }],
    totalBytes: 4096,
    rowFields: ['id', 'event'],
    citingItems: [{ id: 'AIR-I-01', kind: 'row', citations: 2, withQuotes: 0 }],
    privateRows: [{ id: 'AIR-I-06', publicSummary: 'AIR internal escalation inject' }],
    sharesQuotes: false,
  }
  it('lists what leaves, the citing rows and the private placeholders, with no violations', async () => {
    mockTtx({})
    renderAt('/x', '/x', () => (
      <ExportReviewPanel review={review} onSave={() => {}} onCancel={() => {}} />
    ))
    expect(screen.getByText(/Only the document title and heading are included/)).toBeTruthy()
    expect(screen.getByText(/AIR-I-06/)).toBeTruthy()
    expect(await violations()).toEqual([])
  })
})

describe('MergeReview', () => {
  const preview: MergePreviewView = {
    bundles: [{ path: '/a.asexercise', orgId: 'air', fingerprint: FP, pin: 'pinned', revision: 2 }],
    orgs: [
      {
        orgId: 'air',
        revision: 2,
        usable: true,
        added: ['AIR-I-05'],
        changed: [{ id: 'AIR-I-01', fields: [{ field: 'time', before: '0:10', after: '0:15' }] }],
        removed: ['AIR-I-02'],
        placeholders: ['AIR-I-05'],
        rejectedRows: ['HOSP-I-09'],
        rejectedInjects: [],
      },
    ],
    conflicts: [
      {
        code: 'ownership',
        severity: 'rejected',
        orgId: 'air',
        rowId: 'HOSP-I-09',
        message: 'HOSP-I-09 is owned by hosp',
      },
    ],
  }
  it('shows added, changed and removed as words and applies the accepted slices', async () => {
    mockTtx({})
    const applied: unknown[] = []
    renderAt('/x', '/x', () => (
      <MergeReview preview={preview} busy={false} onApply={(a) => applied.push(a)} />
    ))
    expect(screen.getByText('added')).toBeTruthy()
    expect(screen.getByText('changed')).toBeTruthy()
    expect(screen.getByText('removed')).toBeTruthy()
    expect(screen.getByText(/private placeholder/)).toBeTruthy()
    expect(await violations()).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Merge accepted slices' }))
    expect(applied).toEqual([[{ orgId: 'air', revision: 2 }]])
  })
})

describe('RegionalPage', () => {
  it('shows the identities, join and setup screens without violations', async () => {
    mockTtx({
      'regional:identities': () => [
        {
          orgId: 'air',
          name: 'Harborview Airport Authority',
          prefix: 'AIR',
          publicKey: 'k',
          fingerprint: FP,
          liveKey: 'l',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      'scenarios:list': () => [
        { id: 's1', title: 'Power loss', status: 'draft', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      'regional:state': () => null,
    })
    const { projectUrl } = await import('../documents/test-utils')
    renderAt(projectUrl('regional'), '/p/:projectKey/regional', RegionalPage)
    await waitFor(() => expect(screen.getByText('Set up a regional exercise')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'Regional exercises', level: 1 })).toBeTruthy()
    expect(await violations()).toEqual([])
    void PROJECT
  })
})
