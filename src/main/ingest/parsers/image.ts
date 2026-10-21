// PNG/JPG → OCR text (tesseract.js) → plain-text heading heuristics.
// Language data comes from the bundled @tesseract.js-data/eng package — never the network.
// tesseract.js runs recognition in its own worker thread, so the main process stays responsive.
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '../../lib/errors'
import type { ParsedDocument, ParseOptions } from '../types'
import { parseText } from './text'

const requireFromHere = createRequire(import.meta.url)

interface LangData {
  langPath: string
  gzip: boolean
}

/** Locate the bundled English traineddata; throws a clear error when it is missing. */
export function bundledLangData(): LangData {
  let data: { langPath: string; gzip: boolean }
  try {
    data = requireFromHere('@tesseract.js-data/eng') as LangData
  } catch {
    throw new AppError('NOT_FOUND', 'OCR language data (@tesseract.js-data/eng) is not installed')
  }
  const file = join(data.langPath, data.gzip ? 'eng.traineddata.gz' : 'eng.traineddata')
  if (!existsSync(file)) {
    throw new AppError('NOT_FOUND', `OCR language data is missing: ${file}`)
  }
  return { langPath: data.langPath, gzip: data.gzip }
}

export async function ocrImage(filePath: string, opts: ParseOptions = {}): Promise<string> {
  const lang = bundledLangData()
  const { createWorker, OEM } = await import('tesseract.js')
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    langPath: lang.langPath,
    gzip: lang.gzip,
    cacheMethod: 'none',
    logger: () => undefined,
    errorHandler: () => undefined,
  })
  const abort = () => void worker.terminate()
  opts.signal?.addEventListener('abort', abort, { once: true })
  try {
    const { data } = await worker.recognize(filePath)
    if (opts.signal?.aborted) throw new AppError('CANCELLED', 'Cancelled')
    return data.text
  } finally {
    opts.signal?.removeEventListener('abort', abort)
    await worker.terminate().catch(() => undefined)
  }
}

export async function parseImage(
  filePath: string,
  fallbackTitle: string,
  opts: ParseOptions = {},
): Promise<ParsedDocument> {
  const text = await ocrImage(filePath, opts)
  if (!text.trim()) throw new AppError('VALIDATION', 'OCR found no text in this image')
  const parsed = parseText(text, { fallbackTitle, page: 1 })
  return { ...parsed, pages: 1 }
}
