// Never-send documents and the scenario check's embedding of cited passages (#502).
import { describe, expect, it, vi } from 'vitest'
import type { EmbeddingProvider } from '../providers/types'
import { similarities } from './scenario'

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1', getPath: () => '/tmp' },
  BrowserWindow: { getAllWindows: () => [] },
}))

const passage = (chunkId: number, documentId: string, text: string) => ({
  chunkId,
  documentId,
  documentTitle: `Doc ${documentId}`,
  headingPath: 'A',
  text,
})

const items = [
  {
    item: { key: 'row:1', kind: 'row', claimText: 'Doors fail unlocked.' },
    passages: [passage(1, 'secret', 'SECRET TEXT'), passage(2, 'open', 'Public text.')],
    fingerprint: 'f',
  },
] as never

function cloud(remote: boolean) {
  const calls: { texts: string[]; titles?: string[] | undefined }[] = []
  const embedder: EmbeddingProvider = {
    id: 'cloud',
    model: 'm',
    dims: 2,
    remote,
    async embed(texts, _signal, meta) {
      calls.push({ texts, titles: meta?.documentTitles })
      return texts.map(() => new Float32Array([1, 0]))
    },
  }
  return { embedder, calls }
}

describe('similarities with a cloud embedder', () => {
  it('sends no never-send passage and names the documents it does send', async () => {
    const { embedder, calls } = cloud(true)
    const out = await similarities(items, embedder, new Set(['secret']))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.texts.join('\n')).not.toContain('SECRET TEXT')
    expect(calls[0]!.texts).toContain('Public text.')
    expect(calls[0]!.titles).toContain('Doc open')
    const perSentence = out!.get('row:1')!.get('Doors fail unlocked.')!
    expect([...perSentence.keys()]).toEqual([2])
  })

  it('does not filter for a local embedder', async () => {
    const { embedder, calls } = cloud(false)
    await similarities(items, embedder, new Set(['secret']))
    expect(calls[0]!.texts).toContain('SECRET TEXT')
  })
})
