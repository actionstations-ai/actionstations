// Settings → Privacy (#433): the default review policy and redaction for cloud providers. A
// project can override them on its Cloud and privacy page.
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'
import type { PrivacySettings } from '@shared/schemas'
import { PrivacyEditor } from '../../components/privacy/PrivacyEditor'
import { useRemoteProviderLabels } from '../../components/privacy/use-remote-providers'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { useIpcMutation, useIpcQuery } from '../../lib/query'

export function PrivacySection() {
  const view = useIpcQuery('privacy:get', {})
  const heading = useRef<HTMLHeadingElement>(null)
  const { hash } = useLocation()
  useEffect(() => {
    // "Change redaction" in the approval dialog links here (#privacy).
    if (hash !== '#privacy' || !view.data) return
    heading.current?.scrollIntoView?.({ block: 'start' })
    heading.current?.focus()
  }, [hash, view.data])
  const remote = useRemoteProviderLabels()
  const set = useIpcMutation('privacy:set', { invalidates: ['privacy:get'] })
  const save = (settings: PrivacySettings, confirmOff?: true) =>
    set.mutate(
      { settings, ...(confirmOff ? { confirmOff } : {}) },
      {
        onSuccess: () => toast.success('Privacy settings saved'),
        onError: (err) => toast.error('Could not save privacy settings', err),
      },
    )
  return (
    <section id="privacy" className="card stack settings-section" aria-labelledby="privacy-heading">
      <div>
        <h2 id="privacy-heading" ref={heading} tabIndex={-1}>
          Privacy
        </h2>
        <p className="muted">
          Local providers on this computer never see these steps. Before a request goes to a cloud
          provider, the app can show you exactly which plan excerpts and text it would send, and
          replace names, phone numbers, email addresses and street addresses with placeholders. The
          real values are put back on this computer when the reply arrives; the list of replacements
          is never sent. These are the defaults; each project can change them.
        </p>
      </div>
      {view.isError && (
        <p className="field__error" role="alert">
          {errorText(view.error)}
        </p>
      )}
      {view.data && (
        <PrivacyEditor
          key={JSON.stringify(view.data.global)}
          value={view.data.global}
          remoteProviders={remote}
          saving={set.isPending}
          onSave={save}
        />
      )}
    </section>
  )
}
