// One-time notice after the settings folder moved to "Action Stations" (#277): API keys this
// install could not decrypt were set aside, and those providers need their key entered again.
import { KeyRound } from 'lucide-react'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import type { ProviderViewT } from './catalog'

export function KeyReentryNotice({ providers }: { providers: ProviderViewT[] }) {
  const settings = useIpcQuery('settings:get', undefined)
  const dismiss = useIpcMutation('settings:update', { invalidates: ['settings:get'] })
  const reentry = settings.data?.keyReentry
  if (!reentry || reentry.dismissed || reentry.providerIds.length === 0) return null
  const names = reentry.providerIds.map((id) => providers.find((p) => p.id === id)?.label ?? id)
  return (
    <aside className="key-reentry" role="status" aria-label="API keys to enter again">
      <KeyRound size={16} aria-hidden />
      <div className="stack">
        <p>
          <strong>Enter these API keys again: {names.join(', ')}.</strong> The app was renamed to
          Action Stations and moved its settings folder. Your providers and projects came along, but
          these saved keys could not be unlocked under the new name. Open each provider with Edit
          and paste its key. The unreadable keys were kept, encrypted, in a secrets.unreadable file
          in the settings folder.
        </p>
        <div>
          <Button
            onClick={() =>
              dismiss.mutate(
                { keyReentryDismissed: true },
                { onError: (err) => toast.error('Could not hide the notice', err) },
              )
            }
          >
            Dismiss
          </Button>
        </div>
      </div>
    </aside>
  )
}
