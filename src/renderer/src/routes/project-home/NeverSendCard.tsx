// Project → Cloud and privacy: documents whose sections never go to a cloud provider (#502).
import { toggleId } from '../../components/privacy/privacy-model'
import { toast } from '../../components/toast-store'
import { errorText } from '../../lib/errors'
import { useIpcMutation, useIpcQuery } from '../../lib/query'
import '../../components/privacy/privacy.css'

export function NeverSendCard({ projectPath }: { projectPath: string }) {
  const docs = useIpcQuery('documents:list', { projectPath })
  const view = useIpcQuery('privacy:get', { projectPath })
  const set = useIpcMutation('privacy:set', { invalidates: ['privacy:get'] })
  if (docs.isError || view.isError)
    return (
      <p className="field__error" role="alert">
        {errorText(docs.error ?? view.error)}
      </p>
    )
  if (!docs.data?.length || !view.data) return null
  const withheld = view.data.effective.neverSend
  const change = (id: string, on: boolean) =>
    set.mutate(
      {
        projectPath,
        settings: { ...(view.data.project ?? {}), neverSend: toggleId(withheld, id, on) },
      },
      { onError: (err) => toast.error('Could not save this choice', err) },
    )
  return (
    <section className="card stack" aria-labelledby="never-send-heading">
      <div>
        <h2 id="never-send-heading">Documents never sent to the cloud</h2>
        <p className="muted">
          Sections of a marked document are left out of every request to a cloud provider. Local
          providers still use them. The choice is saved in the project file.
        </p>
      </div>
      <ul className="privacy-terms">
        {docs.data.map((d) => (
          <li key={d.id}>
            <label className="row">
              <input
                type="checkbox"
                checked={withheld.includes(d.id)}
                disabled={set.isPending}
                onChange={(e) => change(d.id, e.target.checked)}
              />
              Never send {d.title}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
