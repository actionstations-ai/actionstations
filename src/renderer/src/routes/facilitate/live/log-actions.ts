// Log view helpers (#417): the kind groups of the filter and the export call.
import { call } from '../../../lib/api'
import { toast } from '../../../components/toast-store'

export const KIND_GROUPS: Record<string, string[]> = {
  all: [],
  injects: ['inject.release', 'inject.receipt', 'inject.retract', 'inject.answered'],
  messages: ['message', 'message.handled', 'message.star', 'message.pinned'],
  votes: ['vote.open', 'vote.cast', 'vote.rationale', 'vote.close', 'vote.reopen', 'vote.recorded'],
  hotwash: [
    'hotwash.open',
    'hotwash.close',
    'hotwash.item',
    'hotwash.plus',
    'hotwash.retract',
    'hotwash.update',
    'hotwash.promoted',
    'hotwash.unpromoted',
  ],
  evaluation: ['eval.assign', 'eval.observation', 'eval.watch', 'eval.ask'],
  devices: ['client.join', 'client.leave', 'client.reseat', 'client.kick'],
  problems: ['anomaly'],
}

export async function exportLog(
  base: { projectPath: string; scenarioId: string; sessionId: string },
  format: 'json' | 'csv',
  includeNames: boolean,
) {
  const outPath = await call('dialog:save-file', {
    title: `Export session log (${format.toUpperCase()})`,
    defaultPath: `session-log.${format}`,
    filters: [{ name: format.toUpperCase(), extensions: [format] }],
  })
  if (!outPath) return
  try {
    const r = await call('live:log-export', { ...base, format, outPath, includeNames })
    toast.success('Session log exported', `${r.entries} entries written to ${r.path}`)
  } catch (e) {
    toast.error('Could not export the session log', e)
  }
}
