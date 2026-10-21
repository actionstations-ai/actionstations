import { createHash } from 'node:crypto'
import type { EmbeddingProvider } from '../types'

const STOP = new Set(
  'a an and are as at be by for from has have in is it its of on or that the this to was were will with'.split(
    ' ',
  ),
)

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9§.\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length > 1 && !STOP.has(t))
}

function bucket(feature: string, dims: number): { index: number; sign: number } {
  const h = createHash('md5').update(feature).digest()
  const index = h.readUInt32LE(0) % dims
  const sign = (h[4]! & 1) === 0 ? 1 : -1
  return { index, sign }
}

/**
 * Deterministic feature-hashing embedder (ADR-0005): unigrams + bigrams hashed into a
 * signed 384-d vector, L2-normalized. No model download, no network; used offline and in tests.
 */
export class HashEmbedder implements EmbeddingProvider {
  readonly id = 'hash'
  readonly model = 'feature-hash-v1'
  constructor(readonly dims = 384) {}

  async embed(texts: string[]): Promise<Float32Array[]> {
    return texts.map((t) => this.embedOne(t))
  }

  embedOne(text: string): Float32Array {
    const v = new Float32Array(this.dims)
    const toks = tokens(text)
    const add = (f: string, w: number): void => {
      const { index, sign } = bucket(f, this.dims)
      v[index]! += sign * w
    }
    for (let i = 0; i < toks.length; i++) {
      add(toks[i]!, 1)
      if (i + 1 < toks.length) add(`${toks[i]} ${toks[i + 1]}`, 0.5)
    }
    let norm = 0
    for (const x of v) norm += x * x
    norm = Math.sqrt(norm) || 1
    for (let i = 0; i < v.length; i++) v[i]! /= norm
    return v
  }
}
