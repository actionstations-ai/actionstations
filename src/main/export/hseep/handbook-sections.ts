// Split documents/handbook.md into its sections (overview, room, rules, rubric, hot wash) so the
// HSEEP Controller/Evaluator Handbook (#420) can place each under the matching HSEEP heading
// without rewriting the file. Generated handbooks carry `<!-- section:name -->` markers
// (generate/docs.ts upsertSection); hand-written ones are split at their headings and each
// section is classified by its heading text. A section's own heading is dropped: the HSEEP
// layout gives it a new one.
import type { HandbookSection } from '../../generate/docs'

export type HandbookParts = Partial<Record<HandbookSection, string>> & {
  /** Sections that match none of the known ones, in document order. */
  other: { heading: string; body: string }[]
}

const MARKED = /<!--\s*section:([a-z]+)\s*-->([\s\S]*?)<!--\s*\/section:\1\s*-->/g
const KNOWN = new Set<HandbookSection>(['overview', 'room', 'rules', 'rubric', 'hotwash'])

const CLASSIFY: [RegExp, HandbookSection][] = [
  [/hot\s*wash|debrief/i, 'hotwash'],
  [/rubric|grading|evaluation/i, 'rubric'],
  [/rules|instructor|simcell|conduct/i, 'rules'],
  [/room|logistic|setup|set-up/i, 'room'],
  [/overview|objective|scope/i, 'overview'],
]

const HEADING = /^(#{1,6})\s+(.*)$/

/** Drop a leading heading line (and blank lines) from a section body. */
function dropLeadingHeading(body: string): string {
  const lines = body.replace(/^\s*\n/, '').split('\n')
  while (lines.length && !lines[0]!.trim()) lines.shift()
  if (lines.length && HEADING.test(lines[0]!.trim())) lines.shift()
  return lines.join('\n').trim()
}

function fromMarkers(md: string, parts: HandbookParts): string {
  return md.replace(MARKED, (_all, name: string, body: string) => {
    if (KNOWN.has(name as HandbookSection) && !parts[name as HandbookSection]) {
      parts[name as HandbookSection] = dropLeadingHeading(body)
    }
    return ''
  })
}

/** The shallowest heading depth below the title block (# / ## titles are skipped). */
function sectionDepth(lines: string[]): number | undefined {
  const depths = lines.flatMap((l) => {
    const m = HEADING.exec(l.trim())
    return m && m[1]!.length > 2 ? [m[1]!.length] : []
  })
  return depths.length ? Math.min(...depths) : undefined
}

function fromHeadings(md: string, parts: HandbookParts): void {
  const lines = md.split('\n')
  const depth = sectionDepth(lines)
  if (!depth) return
  let current: { heading: string; lines: string[] } | undefined
  const flush = () => {
    if (!current) return
    const body = current.lines.join('\n').trim()
    const kind = CLASSIFY.find(([re]) => re.test(current!.heading))?.[1]
    if (kind && !parts[kind]) parts[kind] = body
    else if (body) parts.other.push({ heading: current.heading, body })
  }
  for (const line of lines) {
    const m = HEADING.exec(line.trim())
    if (m && m[1]!.length === depth) {
      flush()
      current = { heading: m[2]!.replace(/^\d+(\.\d+)*\.?\s*/, '').trim(), lines: [] }
    } else if (current) current.lines.push(line)
  }
  flush()
}

/** The handbook's sections by kind; unmarked text outside any section heading is left out. */
export function handbookParts(md: string): HandbookParts {
  const parts: HandbookParts = { other: [] }
  const rest = fromMarkers(md, parts)
  fromHeadings(rest, parts)
  return parts
}
