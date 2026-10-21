// Global Providers page: configured providers, local detection, and default task routing.
import { useState } from 'react'
import { Button, EmptyState, PageHeader } from '../../components/ui'
import { useIpcQuery } from '../../lib/query'
import { DetectLocal } from './DetectLocal'
import { ProviderCard } from './ProviderCard'
import { ProviderDialog } from './ProviderDialog'
import { RoutingTable } from './RoutingTable'
import { useSaveRouting } from './use-save-routing'
import type { ProviderViewT } from './catalog'
import './providers.css'

function GlobalRouting({ providers }: { providers: ProviderViewT[] }) {
  const routing = useIpcQuery('routing:get', {})
  const { save, saving } = useSaveRouting('global')
  return (
    <section className="card stack" aria-labelledby="routing-heading">
      <div>
        <h2 id="routing-heading">Routing</h2>
        <p className="muted">
          Which provider and model each task uses by default. Projects can override any row.
        </p>
      </div>
      {routing.isError && <p className="field__error">{routing.error.message}</p>}
      {routing.data && (
        <RoutingTable
          key={JSON.stringify(routing.data)}
          scope="global"
          providers={providers}
          view={routing.data}
          saving={saving}
          onSave={save}
        />
      )}
    </section>
  )
}

export default function ProvidersPage() {
  const providers = useIpcQuery('providers:list', undefined)
  const [editing, setEditing] = useState<ProviderViewT | 'new' | null>(null)
  const list = providers.data ?? []
  return (
    <div className="page page--wide">
      <PageHeader
        eyebrow="Application"
        title="Providers"
        description="Models and media services the generator may call. Only providers you add here are ever contacted."
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            Add provider
          </Button>
        }
      />
      {providers.isError && <p className="field__error">{providers.error.message}</p>}
      <DetectLocal providers={list} />
      {providers.data && list.length === 0 && (
        <EmptyState
          title="No providers yet"
          body="Detect a local service above or add one by hand. LM Studio and Ollama keep everything on this computer."
        />
      )}
      {list.length > 0 && (
        <section aria-label="Configured providers" className="grid-cards">
          {list.map((p) => (
            <ProviderCard key={p.id} provider={p} onEdit={() => setEditing(p)} />
          ))}
        </section>
      )}
      {providers.data && <GlobalRouting providers={list} />}
      <ProviderDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        {...(editing && editing !== 'new' ? { existing: editing } : {})}
      />
    </div>
  )
}
