// The mock provider's micro-drill assessment (#437): a point counts as covered when most of its
// content words appear in the answer, partly covered when some do. It reads the same
// "- [id] text" lines and <answer> block the real prompt sends, so tests and the e2e run see
// answers judged by what they say, and the assessment probes pass and fail as intended.
import type { MicroDrillAssessOutput } from '@shared/schemas'
import type { ChatRequest } from '../types'

const words = (text: string): string[] => [
  ...new Set(text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []),
]

function share(point: string, answer: Set<string>): number {
  const ws = words(point)
  return ws.length ? ws.filter((w) => answer.has(w)).length / ws.length : 0
}

export function mockMicroDrillAssess(req: ChatRequest): MicroDrillAssessOutput {
  const text = req.messages.map((m) => m.content).join('\n')
  const answer = new Set(words(/<answer>([\s\S]*?)<\/answer>/.exec(text)?.[1] ?? ''))
  const points = [...text.matchAll(/^- \[([A-Za-z0-9_-]+)\] (.+)$/gm)].map((m) => ({
    id: m[1]!,
    text: m[2]!,
  }))
  const out: MicroDrillAssessOutput = { covered: [], partial: [], missing: [] }
  for (const p of points) {
    const s = share(p.text, answer)
    if (s >= 0.6) out.covered.push(p.id)
    else if (s >= 0.3) out.partial.push(p.id)
    else out.missing.push(p.id)
  }
  if (out.missing.length) out.followUp = 'What else does the plan expect at this point?'
  return out
}
