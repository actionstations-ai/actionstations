// Your packs (#1152): what is on this computer as a compact list: updates first, then packs that
// need attention, the packs you installed, and the packs included with the app (ADR-0020), each
// with its on/off switch. A row opens the pack's page; a filter narrows the long included list.
import { useMemo, useState } from 'react'
import type { PackUpdateView } from '@shared/ipc'
import { STORE_KIND_LABEL } from '@shared/packs/store'
import { Button, EmptyState } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { useIpcMutation } from '../../lib/query'
import { EnabledSwitch } from './pack-controls'
import { filterStore, type StorePack } from './store-model'
import { PackIcon, StatePill } from './StoreTile'

type Show = 'all' | 'on' | 'off'

function PackLine(props: {
  pack: StorePack
  onOpen: (id: string) => void
  onUpdate?: ((u: PackUpdateView, name: string) => void) | undefined
  updating?: boolean
}) {
  const { pack } = props
  const p = pack.installed!
  return (
    <li className="pack-line" aria-label={pack.name}>
      <PackIcon pack={pack} />
      <button type="button" className="pack-line__open" onClick={() => props.onOpen(pack.id)}>
        <span className="pack-line__name">{pack.name}</span>
        <span className="pack-line__sub">
          {STORE_KIND_LABEL[pack.kind].one} · {pack.category.label} · {pack.version}
        </span>
      </button>
      {p.broken ? (
        <StatePill pack={pack} />
      ) : p.conflict ? (
        <span className="pack-pill" data-tone="error">
          Conflict
        </span>
      ) : null}
      {pack.update && props.onUpdate && (
        <Button
          size="sm"
          variant="primary"
          disabled={props.updating}
          onClick={() => props.onUpdate!(pack.update!, pack.name)}
        >
          Review update to {pack.update.latest.version}
          <span className="sr-only"> of {pack.name}</span>
        </Button>
      )}
      {!p.broken && (
        <EnabledSwitch
          pack={p}
          label={
            <>
              On<span className="sr-only"> {pack.name}</span>
            </>
          }
        />
      )}
      {p.conflict && (
        <p className="pack-line__note pack-callout pack-callout--warn">{p.conflict}</p>
      )}
    </li>
  )
}

function CheckFiles() {
  const verify = useIpcMutation('packs:verify', { invalidates: ['packs:list', 'packs:updates'] })
  return (
    <Button
      size="sm"
      disabled={verify.isPending}
      onClick={() =>
        verify.mutate(
          {},
          {
            onSuccess: (r) => {
              const bad = r.filter((v) => !v.ok)
              if (bad.length === 0) toast.success('Every installed file matches its hash')
              else toast.error(`${bad.length} pack(s) changed on disk`, bad[0]?.problem)
            },
            onError: (err) => toast.error('Could not check the packs', err),
          },
        )
      }
    >
      {verify.isPending ? 'Checking…' : 'Check files'}
    </Button>
  )
}

function Group(props: {
  title: string
  hint?: string
  packs: StorePack[]
  onOpen: (id: string) => void
  onUpdate?: (u: PackUpdateView, name: string) => void
  updating?: boolean
}) {
  if (!props.packs.length) return null
  const id = `your-${props.title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section className="stack" aria-labelledby={id}>
      <h2 id={id} className="pack-section__title">
        {props.title} <span className="muted">({props.packs.length})</span>
      </h2>
      {props.hint && <p className="muted">{props.hint}</p>}
      <ul className="pack-lines" aria-label={props.title}>
        {props.packs.map((p) => (
          <PackLine
            key={p.id}
            pack={p}
            onOpen={props.onOpen}
            onUpdate={props.onUpdate}
            updating={!!props.updating}
          />
        ))}
      </ul>
    </section>
  )
}

export function YourPacksTab(props: {
  packs: readonly StorePack[]
  onOpen: (id: string) => void
  onUpdate: (u: PackUpdateView, name: string) => void
  onDiscover: () => void
  onInstallFile: () => void
  updating: boolean
}) {
  const [query, setQuery] = useState('')
  const [show, setShow] = useState<Show>('all')
  const mine = useMemo(() => {
    const local = props.packs.filter((p) => p.installed)
    const found = filterStore(local, { query, category: '', kind: '' })
    return show === 'all' ? found : found.filter((p) => p.installed!.enabled === (show === 'on'))
  }, [props.packs, query, show])
  const updates = mine.filter((p) => p.update)
  const attention = mine.filter((p) => !p.update && (p.installed!.broken || p.installed!.conflict))
  const rest = mine.filter((p) => !updates.includes(p) && !attention.includes(p))
  const installed = rest.filter((p) => !p.installed!.bundled)
  const included = rest.filter((p) => p.installed!.bundled)
  const anyInstalled = props.packs.some((p) => p.installed && !p.installed.bundled)

  return (
    <div className="stack">
      <div className="row pack-toolbar">
        <div className="row pack-your-filters">
          <label className="sr-only" htmlFor="your-search">
            Filter your packs
          </label>
          <input
            id="your-search"
            className="input"
            type="search"
            value={query}
            placeholder="Filter your packs"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="pack-chips" role="group" aria-label="Show">
            {(['all', 'on', 'off'] as Show[]).map((s) => (
              <button
                key={s}
                type="button"
                className={show === s ? 'pack-chip pack-chip--on' : 'pack-chip'}
                aria-pressed={show === s}
                onClick={() => setShow(s)}
              >
                {s === 'all' ? 'All' : s === 'on' ? 'On' : 'Off'}
              </button>
            ))}
          </div>
        </div>
        <CheckFiles />
      </div>
      <Group
        title="Updates"
        packs={updates}
        onOpen={props.onOpen}
        onUpdate={props.onUpdate}
        updating={props.updating}
      />
      <Group title="Needs attention" packs={attention} onOpen={props.onOpen} />
      {anyInstalled ? (
        <Group title="Installed packs" packs={installed} onOpen={props.onOpen} />
      ) : (
        !query &&
        show === 'all' && (
          <section className="pack-offer" aria-label="No packs installed">
            <p>
              <strong>No packs installed yet.</strong>{' '}
              <span className="muted">
                Reference libraries, community packs and your own exports install from a catalog or
                an .aspack file, reviewed first.
              </span>
            </p>
            <div className="row">
              <Button size="sm" variant="primary" onClick={props.onDiscover}>
                Discover packs
              </Button>
              <Button size="sm" onClick={props.onInstallFile}>
                Install from file…
              </Button>
            </div>
          </section>
        )
      )}
      <Group
        title="Included with the app"
        hint="Turn off a field you never exercise: it leaves the pickers and galleries. Projects that already use it keep working."
        packs={included}
        onOpen={props.onOpen}
      />
      {mine.length === 0 && (query || show !== 'all') && (
        <EmptyState
          title="None of your packs match"
          actions={
            <Button
              onClick={() => {
                setQuery('')
                setShow('all')
              }}
            >
              Clear filter
            </Button>
          }
        />
      )}
    </div>
  )
}
