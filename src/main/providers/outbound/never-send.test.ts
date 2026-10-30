// The never-send list (#502): a project can add to the app-wide list but not shrink it, and it
// applies only to a cloud embedder.
import { describe, expect, it, vi } from 'vitest'
import { PrivacySettings } from '@shared/schemas'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => '/tmp' },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}))

const { mergePrivacy } = await import('./settings')
const { neverSendDocuments } = await import('./never-send')

describe('mergePrivacy never-send', () => {
  const global = PrivacySettings.parse({ neverSend: ['a'] })

  it('is the union of the app list and the project list', () => {
    expect(mergePrivacy(global, { neverSend: ['b', 'a'] }).neverSend.sort()).toEqual(['a', 'b'])
  })

  it('keeps the app list when the project sets an empty one', () => {
    expect(mergePrivacy(global, { neverSend: [] }).neverSend).toEqual(['a'])
  })
})

describe('neverSendDocuments', () => {
  it('is empty for an embedder that runs on this computer', async () => {
    expect((await neverSendDocuments('/p', { remote: false })).size).toBe(0)
    expect((await neverSendDocuments('/p', undefined)).size).toBe(0)
  })
})
