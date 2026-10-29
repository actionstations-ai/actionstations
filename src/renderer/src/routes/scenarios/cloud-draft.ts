// Words and checks for the hot wash transcript warning on the Draft dialog (#425 FR-14).
import { isRemoteProvider } from '@shared/provider-network'
import type { ProviderView } from '@shared/schemas'

/** The cloud provider the draft goes to, or undefined when it stays on this computer. */
export function cloudDraftProvider(
  providers: readonly ProviderView[] | undefined,
  providerId: string | undefined,
): ProviderView | undefined {
  const chosen = providers?.find((p) => p.id === providerId)
  return chosen && isRemoteProvider(chosen) ? chosen : undefined
}

export function transcriptWarningText(quotes: number, provider: string): string {
  const what =
    quotes === 1
      ? '1 marked quote from the hot wash transcript is'
      : `${quotes} marked quotes from the hot wash transcript are`
  return `${what} part of this draft's input and will be sent to ${provider}, a cloud provider. Quotes you redacted are never sent. To keep them on this computer, route the Draft task to a local model in Providers first.`
}
