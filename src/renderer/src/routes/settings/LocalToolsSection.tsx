// Settings → Local tools (ADR-0021, #334): change how models run, install or start local
// tools, and download recommended models. Cloud APIs only shows no tool rows.
import { useState } from 'react'
import type { AppSettings, SetupMode } from '@shared/schemas'
import { LocalToolsPanel } from '../../components/local-tools/LocalToolsPanel'
import { RuntimeChoice } from '../../components/local-tools/RuntimeChoice'
import { saveSetup } from '../../components/local-tools/use-local-tools'
import { toast } from '../../components/toast-store'

export function LocalToolsSection({ settings }: { settings: AppSettings }) {
  // The radio follows the click at once; the saved settings catch up.
  const [picked, setPicked] = useState<SetupMode>()
  const setup = { ...(settings.setup ?? { skipped: [] }), ...(picked ? { mode: picked } : {}) }
  const choose = (mode: SetupMode) => {
    setPicked(mode)
    void saveSetup({ mode }).then(
      () => toast.success('Saved'),
      (err: unknown) => toast.error('Could not save', err),
    )
  }
  return (
    <section className="card stack settings-section" aria-labelledby="local-tools-heading">
      <div>
        <h2 id="local-tools-heading">Local tools</h2>
        <p className="muted">
          Run models with cloud APIs, with tools on this computer, or both. Tools are installed only
          when you ask, from the vendor&rsquo;s official download.
        </p>
      </div>
      <RuntimeChoice value={setup.mode} onChange={choose} name="settings-runtime-mode" />
      {(setup.mode === 'local' || setup.mode === 'mix') && <LocalToolsPanel setup={setup} />}
    </section>
  )
}
