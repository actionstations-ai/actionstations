// MP3 export via lamejs. Its CommonJS entry (src/js/index.js) references undeclared globals
// (MPEGMode) and throws on first use, so the self-contained lame.all.js bundle is evaluated
// inside a function scope instead — nothing leaks onto globalThis.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInThisContext } from 'node:vm'
import { decodeWav, toInt16 } from './wav'

interface Mp3Encoder {
  encodeBuffer(left: Int16Array): Int8Array
  flush(): Int8Array
}
interface LameModule {
  Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => Mp3Encoder
}

let lame: LameModule | undefined

function loadLame(): LameModule {
  if (lame) return lame
  const path = createRequire(import.meta.url).resolve('lamejs/lame.all.js')
  const source = readFileSync(path, 'utf8')
  lame = runInThisContext(`(function () {\n${source}\nreturn lamejs;\n})()`, {
    filename: path,
  }) as LameModule
  return lame
}

const FRAME = 1152

/** Encode a WAV (any rate / depth / channels) to mono MP3 at `kbps`. */
export function toMp3(wav: Uint8Array, kbps = 128): Uint8Array {
  const { samples, sampleRate } = decodeWav(wav)
  const pcm = toInt16(samples)
  const encoder = new (loadLame().Mp3Encoder)(1, sampleRate, kbps)
  const chunks: Int8Array[] = []
  for (let i = 0; i < pcm.length; i += FRAME) {
    const chunk = encoder.encodeBuffer(pcm.subarray(i, i + FRAME))
    if (chunk.length) chunks.push(chunk)
  }
  const tail = encoder.flush()
  if (tail.length) chunks.push(tail)
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(new Uint8Array(c.buffer, c.byteOffset, c.length), offset)
    offset += c.length
  }
  return out
}
