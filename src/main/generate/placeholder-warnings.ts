// Redaction placeholders a model invented (#502): the stage logs them, and the pipeline step
// records them on the scenario so the reviewer sees them next to the other warnings.
import type { LintWarning, Scenario } from '@shared/schemas'
import type { JobContext } from '../jobs/manager'

export const REDACTION_UNKNOWN = 'REDACTION_UNKNOWN'

/** The log line for placeholders in a reply that this project never issued. */
export function unknownPlaceholderLog(names: string[]): string {
  return `${REDACTION_UNKNOWN}: the reply used placeholders this project never issued (${names.join(', ')}); they were left as written`
}

export interface PlaceholderFinding {
  message: string
  itemId?: string
}

/** A context that passes everything through and remembers the unknown-placeholder lines. */
export function watchPlaceholders(ctx: JobContext): {
  ctx: JobContext
  found: PlaceholderFinding[]
} {
  const found: PlaceholderFinding[] = []
  const watched: JobContext = {
    ...ctx,
    log(message, level, extra) {
      if (message.startsWith(`${REDACTION_UNKNOWN}:`))
        found.push({ message, ...(extra?.itemId ? { itemId: extra.itemId } : {}) })
      ctx.log(message, level, extra)
    },
  }
  return { ctx: watched, found }
}

/** Replace this step's earlier placeholder warnings with the ones it just found. */
export function recordPlaceholderWarnings(
  s: Scenario,
  label: string,
  found: PlaceholderFinding[],
): void {
  const mine = (w: LintWarning): boolean =>
    w.code === REDACTION_UNKNOWN && w.message.startsWith(`${label}: `)
  s.warnings = s.warnings.filter((w) => !mine(w))
  const seen = new Set<string>()
  for (const f of found) {
    const message = `${label}: ${f.message.slice(REDACTION_UNKNOWN.length + 2)}`
    if (seen.has(message)) continue
    seen.add(message)
    s.warnings.push({
      code: REDACTION_UNKNOWN,
      severity: 'warning',
      message,
      source: 'lint',
      suggestion: 'Replace the invented placeholder with the real value, or regenerate the row.',
    })
  }
}
