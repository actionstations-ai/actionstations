// Generated briefing.md / handbook.md often open with their own fact line under the title
// ("Location: … · Duration: … · Exercise time: …"). The export prints those facts in its
// title block already, so the duplicate segments are dropped from the body (#154). Segments
// the header does not show (e.g. "Weather: …") stay.

/** Header fact label → the concept it stands for. */
const CONCEPTS: [RegExp, string][] = [
  [/^(exercise\s+)?location$|^(venue|site)$/i, 'location'],
  [/^(exercise\s+)?duration$|^length$/i, 'duration'],
  [/^(exercise|current|start(ing)?|startex)\s*time$|^time$|^startex$/i, 'time'],
  [/^(exercise\s+)?date$/i, 'date'],
]

const SEGMENT = /^\s*[*_]*([A-Za-z][A-Za-z /()-]{0,30}?)[*_]*\s*:[*_]*\s*\S/
const SEPARATOR = /\s+[·•|]\s+/

function conceptOf(label: string): string | undefined {
  const key = label.replace(/[*_]/g, '').trim()
  return CONCEPTS.find(([re]) => re.test(key))?.[1]
}

/** The leading block (blank lines, comments, # / ## title headings) before the body. */
function leadingLineCount(lines: string[]): number {
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!.trim()
    if (line === '' || /^#{1,2}\s/.test(line) || /^<!--.*-->$/.test(line)) i++
    else break
  }
  return i
}

/** Every segment of the line is `Label: value`; returns the segments, else undefined. */
function factSegments(line: string): string[] | undefined {
  const segments = line.trim().split(SEPARATOR)
  return segments.every((s) => SEGMENT.test(s)) ? segments : undefined
}

function keepSegment(segment: string, shown: Set<string>): boolean {
  const label = SEGMENT.exec(segment)?.[1] ?? ''
  const concept = conceptOf(label)
  return !concept || !shown.has(concept)
}

/**
 * Drop the segments of the opening fact paragraph that repeat the export header's facts.
 * `headerLabels` are the labels the header actually prints (empty facts are not printed, so
 * their body counterpart stays). Only the first paragraph after the title headings is
 * touched, and only when every line of it is a `Label: value` fact line.
 */
export function dropDuplicateHeaderFacts(md: string, headerLabels: string[]): string {
  const shown = new Set(headerLabels.map(conceptOf).filter((c): c is string => !!c))
  if (!shown.size) return md
  const lines = md.split('\n')
  const start = leadingLineCount(lines)
  let end = start
  while (end < lines.length && lines[end]!.trim() !== '') end++
  const paragraph = lines.slice(start, end)
  const parsed = paragraph.map(factSegments)
  if (!paragraph.length || parsed.some((p) => !p)) return md
  const kept = parsed
    .map((segments) => segments!.filter((s) => keepSegment(s, shown)).join(' · '))
    .filter((line) => line.trim() !== '')
  return [...lines.slice(0, start), ...kept, ...lines.slice(end)].join('\n')
}
