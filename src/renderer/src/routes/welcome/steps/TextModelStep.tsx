// Step 2: a text model. Detect LM Studio / Ollama, or add Anthropic; test; route the text tasks.
import { useState } from 'react'
import { Button } from '../../../components/ui'
import { useIpcQuery } from '../../../lib/query'
import { StepLayout, type StepNav } from '../StepLayout'
import { saveGlobalRouting, useAction, useLocalServices, useProviders } from '../use-setup'
import {
  TEXT_TASKS,
  defaultTextChoice,
  findAdded,
  isTextService,
  textProviders,
  type ProviderViewT,
  type TextChoice,
} from '../wizard-state'
import { AnthropicCard } from './AnthropicCard'
import { LocalServiceRow } from './LocalServiceRow'
import { ProviderChoice } from './ProviderChoice'
import { errorText } from '../../../lib/errors'

function LocalTextServices(props: {
  providers: ProviderViewT[]
  onAdded: (p: ProviderViewT) => void
}) {
  const detect = useLocalServices()
  const services = (detect.data ?? []).filter(isTextService)
  return (
    <div className="card stack">
      <div className="row wizard-card__head">
        <h3>On this computer</h3>
        <Button size="sm" onClick={() => void detect.refetch()} disabled={detect.isFetching}>
          {detect.isFetching ? 'Detecting…' : 'Detect again'}
        </Button>
      </div>
      <p className="muted">
        Local models keep everything on this machine and cost nothing per run.
      </p>
      {detect.isError && (
        <p className="field__error" role="alert">
          {errorText(detect.error)}
        </p>
      )}
      <ul
        className="wizard-services"
        aria-label="Local text services"
        aria-busy={detect.isFetching}
      >
        {services.map((s) => (
          <LocalServiceRow
            key={s.baseUrl}
            service={s}
            added={findAdded(props.providers, s)}
            chooseModel
            onAdded={props.onAdded}
          />
        ))}
      </ul>
    </div>
  )
}

/** Start from the provider already routed to drafting, else the first text provider. */
function useInitialChoice(
  candidates: ProviderViewT[],
): [TextChoice | null, (c: TextChoice) => void] {
  const routing = useIpcQuery('routing:get', {})
  const [choice, setChoice] = useState<TextChoice | null>(null)
  const derived = routing.data ? defaultTextChoice(candidates, routing.data.global.draft) : null
  return [choice ?? derived, setChoice]
}

export function TextModelStep({ onBack, onNext }: StepNav) {
  const providers = useProviders()
  const candidates = textProviders(providers.data ?? [])
  const [choice, setChoice] = useInitialChoice(candidates)
  const save = useAction()
  const select = (p: ProviderViewT) => setChoice({ providerId: p.id, model: p.defaultModel ?? '' })
  const next = async () => {
    const ok = await save.run(() =>
      choice
        ? saveGlobalRouting([
            {
              tasks: TEXT_TASKS,
              ref: {
                providerId: choice.providerId,
                ...(choice.model ? { model: choice.model } : {}),
              },
            },
          ])
        : Promise.resolve(),
    )
    if (ok) onNext()
  }
  return (
    <StepLayout
      title="Choose a text model"
      intro={<p>A language model writes the scenario, MSEL and injects from your documents.</p>}
      {...(onBack ? { onBack } : {})}
      onNext={() => void next()}
      busy={save.busy}
      nextLabel={choice ? 'Use this model' : 'Continue without a model'}
    >
      <LocalTextServices providers={providers.data ?? []} onAdded={select} />
      <AnthropicCard
        existing={(providers.data ?? []).find((p) => p.kind === 'anthropic')}
        onAdded={select}
      />
      {candidates.length > 0 && (
        <ProviderChoice providers={candidates} choice={choice} onChange={setChoice} />
      )}
      {save.error && (
        <p className="field__error" role="alert">
          {save.error}
        </p>
      )}
    </StepLayout>
  )
}
