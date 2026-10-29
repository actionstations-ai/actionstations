// Before a draft: when marked hot wash quotes are part of the record and the draft model is a
// cloud provider, say so and name the provider (#425 FR-14). Shown nowhere else; a local model
// keeps the quotes on this computer, so nothing is shown for it.
import { useIpcQuery } from '../../lib/query'
import { cloudDraftProvider, transcriptWarningText } from './cloud-draft'

export function TranscriptCloudWarning(props: { projectPath: string; scenarioId: string }) {
  const { projectPath, scenarioId } = props
  const quotes = useIpcQuery('hotwash:transcripts', { projectPath, scenarioId, quotesOnly: true })
  const providers = useIpcQuery('providers:list', undefined)
  const routing = useIpcQuery('routing:get', { projectPath })
  const count = quotes.data?.length ?? 0
  const provider = cloudDraftProvider(providers.data, routing.data?.effective.draft?.providerId)
  if (!count || !provider) return null
  return (
    <p className="editor-banner editor-banner--warn" role="alert">
      {transcriptWarningText(count, provider.label)}
    </p>
  )
}
