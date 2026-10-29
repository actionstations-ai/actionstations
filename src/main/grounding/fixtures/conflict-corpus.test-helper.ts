// Test helper (#423): the planted conflict corpus chunked the way ingestion chunks text.md, as
// the plan check's documents. Three short fictional plans with five planted contradictions
// (release approver, State EPA deadline, a phone number, the EOC activation level, the lead
// agency for hazardous materials), two near misses that must not be listed (60 minutes and 1
// hour; two different state agencies) and one reference to an annex nobody ingested (Annex F).
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chunkSections } from '../../ingest/chunker'
import { parseTextMd } from '../../ingest/text-md'
import type { PlanDocument } from '../plan-check'

export const CORPUS_DIR = resolve(import.meta.dirname, 'conflict-corpus')

const SHORT: Record<string, string> = {
  'emergency-response-plan.md': 'ERP',
  'crisis-communications-annex.md': 'CCA',
  'cyber-incident-plan.md': 'CIP',
}

export function loadConflictCorpus(): PlanDocument[] {
  let nextId = 1
  return readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const source = readFileSync(join(CORPUS_DIR, file), 'utf8')
      const title = /^#\s+(.*)$/m.exec(source)?.[1]?.trim() ?? file
      const id = file.replace(/\.md$/, '')
      const parsed = parseTextMd(source, title)
      return {
        id,
        title,
        shortName: SHORT[file]!,
        chunks: chunkSections(parsed.sections, SHORT[file]!).map((c) => ({
          chunkId: nextId++,
          documentId: id,
          documentTitle: title,
          headingPath: c.headingPath,
          text: c.text,
        })),
      }
    })
}
