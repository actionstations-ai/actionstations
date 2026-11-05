// Settings: how much case data one scenario may hold (spec 0448 NFR-4).
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation, useIpcQuery } from '../../lib/query'

export function CaseDataSection() {
  const settings = useIpcQuery('case:settings', undefined)
  const save = useIpcMutation('case:settings-save', { invalidates: ['case:settings', 'case:get'] })
  const [draft, setDraft] = useState<string>()
  const [contactDraft, setContactDraft] = useState<string>()
  const current = settings.data?.maxMbPerScenario
  const shown = draft ?? (current === undefined ? '' : String(current))
  const contact = contactDraft ?? settings.data?.contactEmail ?? ''
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const mb = Math.round(Number(shown))
    if (!Number.isFinite(mb) || mb < 1 || mb > 10_000) {
      toast.error('Enter a size from 1 to 10000 MB')
      return
    }
    save.mutate(
      { maxMbPerScenario: mb, contactEmail: contact.trim() },
      {
        onSuccess: () => {
          setDraft(undefined)
          setContactDraft(undefined)
          toast.success('Case data settings saved')
        },
        onError: (err) => toast.error('Could not save the settings', err),
      },
    )
  }
  return (
    <section className="card stack settings-section" aria-labelledby="case-data-heading">
      <div>
        <h2 id="case-data-heading">Case data</h2>
        <p className="muted">
          Data from a real past event or a simulated one can be kept with a scenario so injects show
          it at the matching moment. It is fetched once, after you see the size and agree, and then
          works offline. This is the most one scenario may hold.
        </p>
      </div>
      <form className="stack" onSubmit={submit}>
        <div className="row">
          <label htmlFor="case-limit-mb">Limit per scenario (MB)</label>
          <input
            id="case-limit-mb"
            className="input"
            inputMode="numeric"
            value={shown}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" disabled={settings.isLoading || save.isPending}>
            Save
          </Button>
        </div>
        <div className="stack">
          <label htmlFor="case-contact">Your contact email (optional)</label>
          <input
            id="case-contact"
            className="input"
            type="email"
            autoComplete="email"
            aria-describedby="case-contact-help"
            value={contact}
            onChange={(e) => setContactDraft(e.target.value)}
          />
          <p id="case-contact-help" className="muted">
            Some public archives, such as SEC EDGAR, ask every caller for a contact. If you fetch
            from one, this address is sent in the request header to that archive only; left empty,
            the app sends help@actionstations.ai instead. Nothing is sent until you agree to a
            fetch.
          </p>
        </div>
      </form>
    </section>
  )
}
