// Pack catalog URLs (#267). None by default; the app fetches a catalog only when the user opens
// Browse or presses Refresh on the Packs screen. This section only edits the list.
import { useState } from 'react'
import type { AppSettings } from '@shared/schemas'
import { PackFetchUrl } from '@shared/schemas/pack'
import { OFFICIAL_CATALOG_URL } from '@shared/ipc'
import { Button, Field } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'

const INVALIDATES = ['settings:get', 'packs:catalogs', 'packs:catalogEntries'] as const

function urlProblem(url: string): string | undefined {
  if (!url) return undefined
  return PackFetchUrl.safeParse(url).success
    ? undefined
    : 'Use an https address (http only for this computer, such as http://127.0.0.1).'
}

function fetchedText(c: AppSettings['packs']['catalogs'][number]): string {
  if (c.lastError) return `Last refresh failed: ${c.lastError}`
  if (c.lastFetchedAt) return `Last refreshed ${new Date(c.lastFetchedAt).toLocaleString()}`
  return 'Not fetched yet'
}

export function PackCatalogsSection({ settings }: { settings: AppSettings }) {
  const catalogs = settings.packs?.catalogs ?? []
  const [url, setUrl] = useState('')
  const add = useIpcMutation('packs:catalogAdd', { invalidates: [...INVALIDATES] })
  const remove = useIpcMutation('packs:catalogRemove', { invalidates: [...INVALIDATES] })
  const hasOfficial = catalogs.some((c) => c.url === OFFICIAL_CATALOG_URL)
  const trimmed = url.trim()
  const problem = urlProblem(trimmed)

  const addUrl = (target: string, after?: () => void) =>
    add.mutate(
      { url: target },
      {
        onSuccess: () => {
          toast.success('Catalog added')
          after?.()
        },
        onError: (err) => toast.error('Could not add the catalog', err),
      },
    )

  return (
    <section className="card stack settings-section" aria-labelledby="catalogs-heading">
      <div>
        <h2 id="catalogs-heading">Pack catalogs</h2>
        <p className="muted">
          Catalogs list packs you can install. None is added by default. A catalog is fetched only
          when you open Browse or press Refresh on the Packs screen, never in the background.
        </p>
      </div>
      {catalogs.length === 0 ? (
        <p className="muted">No catalogs added.</p>
      ) : (
        <ul className="stack settings-catalogs" aria-label="Catalogs">
          {catalogs.map((c) => (
            <li key={c.url} className="row settings-catalog">
              <div className="settings-catalog__text">
                {c.name && <strong>{c.name}</strong>}
                <span className="mono">{c.url}</span>
                <span className={c.lastError ? 'field__error' : 'field__hint'}>
                  {fetchedText(c)}
                </span>
              </div>
              <Button
                size="sm"
                variant="danger"
                aria-label={`Remove ${c.name ?? c.url}`}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { url: c.url },
                    {
                      onSuccess: () => toast.success('Catalog removed'),
                      onError: (err) => toast.error('Could not remove the catalog', err),
                    },
                  )
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!hasOfficial && (
        <div>
          <Button disabled={add.isPending} onClick={() => addUrl(OFFICIAL_CATALOG_URL)}>
            Add the official catalog (actionstations.ai)
          </Button>
        </div>
      )}
      <Field
        label="Catalog URL"
        hint="The address of a catalog's index.json."
        {...(problem ? { error: problem } : {})}
      >
        {({ id, describedBy, invalid }) => (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault()
              if (trimmed && !problem) addUrl(trimmed, () => setUrl(''))
            }}
          >
            <input
              id={id}
              className="input mono"
              type="url"
              placeholder="https://example.org/packs/index.json"
              value={url}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button type="submit" disabled={!trimmed || !!problem || add.isPending}>
              Add catalog
            </Button>
          </form>
        )}
      </Field>
    </section>
  )
}
