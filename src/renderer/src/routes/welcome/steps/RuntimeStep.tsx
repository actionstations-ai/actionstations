// Step 2 (ADR-0021, #334): Cloud APIs only, local tools, or a mix. Local and mix show the
// tool rows (detect, install, start) and recommended models; Cloud APIs only installs nothing.
import { useState } from 'react'
import type { SetupMode } from '@shared/schemas/setup'
import { RuntimeChoice } from '../../../components/local-tools/RuntimeChoice'
import { LocalToolsPanel } from '../../../components/local-tools/LocalToolsPanel'
import { saveSetup } from '../../../components/local-tools/use-local-tools'
import { useIpcQuery } from '../../../lib/query'
import { StepLayout, type StepNav } from '../StepLayout'
import { useAction } from '../use-setup'

export function RuntimeStep({ onBack, onNext }: StepNav) {
  const settings = useIpcQuery('settings:get', undefined)
  const saved = settings.data?.setup ?? { skipped: [] }
  // The radio follows the click at once; the saved settings catch up.
  const [picked, setPicked] = useState<SetupMode>()
  const setup = { ...saved, ...(picked ? { mode: picked } : {}) }
  const action = useAction()
  const choose = (mode: SetupMode) => {
    setPicked(mode)
    void action.run(() => saveSetup({ mode }))
  }
  return (
    <StepLayout
      title="Where should models run?"
      intro={
        <p>
          Use a cloud API, tools on this computer, or both. You can change this later in Settings.
        </p>
      }
      {...(onBack ? { onBack } : {})}
      onNext={onNext}
      nextLabel={setup.mode ? 'Continue' : 'Decide later'}
    >
      <div className="card stack">
        <RuntimeChoice value={setup.mode} onChange={choose} />
        {action.error && (
          <p className="field__error" role="alert">
            {action.error}
          </p>
        )}
      </div>
      {setup.mode === 'cloud' && (
        <p className="muted" role="status">
          Nothing will be installed. Add your API key on the next step.
        </p>
      )}
      {(setup.mode === 'local' || setup.mode === 'mix') && (
        <div className="card">
          <LocalToolsPanel setup={setup} />
        </div>
      )}
    </StepLayout>
  )
}
