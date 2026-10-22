// A local text-to-speech server (OpenAI-compatible /v1/audio/speech, e.g. mlx-audio) for radio
// calls, voicemails and PA announcements.
import { useEffect, useState } from 'react'
import { Button, Field } from '../../../components/ui'
import { call } from '../../../lib/api'
import { queryClient, useIpcQuery } from '../../../lib/query'
import { TestResult } from '../StepLayout'
import { useAction } from '../use-setup'
import {
  TTS_DEFAULT_URL,
  TTS_LABEL,
  dataUrlToBlobUrl,
  formatLatency,
  pickTtsModel,
  type ProviderViewT,
} from '../wizard-state'
import { errorText } from '../../../lib/errors'

const refreshProviders = () => queryClient.invalidateQueries({ queryKey: ['providers:list'] })

/** Add the server, read its model list, and store the chosen speech model. */
async function connectVoiceServer(baseUrl: string): Promise<ProviderViewT> {
  const config = { kind: 'openai-compatible' as const, label: TTS_LABEL, baseUrl, enabled: true }
  const added = await call('providers:upsert', { config: { ...config, options: {} } })
  try {
    const models = (await call('providers:models', { id: added.id })).map((m) => m.id)
    const ttsModel = pickTtsModel(models)
    if (!ttsModel) throw new Error('The server lists no speech models.')
    return await call('providers:upsert', {
      config: { ...config, id: added.id, options: { ttsModel } },
    })
  } catch (err) {
    await call('providers:remove', { id: added.id }).catch(() => undefined)
    throw new Error(`No voice server answered at ${baseUrl}: ${errorText(err)}`, { cause: err })
  } finally {
    await refreshProviders()
  }
}

function ConnectForm() {
  const [url, setUrl] = useState(TTS_DEFAULT_URL)
  const action = useAction()
  return (
    <div className="stack">
      <Field
        label="Voice server URL"
        hint="Any server with an OpenAI-compatible speech endpoint."
        error={action.error ?? undefined}
      >
        {({ id, describedBy, invalid }) => (
          <div className="row">
            <input
              id={id}
              className="input mono"
              value={url}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              disabled={action.busy || !url.trim()}
              onClick={() =>
                void action.run(async () => void (await connectVoiceServer(url.trim())))
              }
            >
              {action.busy ? 'Connecting…' : 'Connect voice server'}
            </Button>
          </div>
        )}
      </Field>
    </div>
  )
}

function VoiceModel({ provider }: { provider: ProviderViewT }) {
  const models = useIpcQuery('providers:models', { id: provider.id })
  const current = String(provider.options['ttsModel'] ?? '')
  const ids = (models.data ?? []).map((m) => m.id)
  if (current && !ids.includes(current)) ids.unshift(current)
  const choose = async (ttsModel: string) => {
    await call('providers:upsert', {
      config: { ...provider, options: { ...provider.options, ttsModel } },
    })
    await refreshProviders()
  }
  return (
    <label className="field">
      <span className="field__label">Voice model</span>
      <select className="select" value={current} onChange={(e) => void choose(e.target.value)}>
        {ids.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  )
}

function CheckVoice({ provider }: { provider: ProviderViewT }) {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const action = useAction()
  const check = () =>
    action.run(async () => {
      const h = await call('providers:health', { id: provider.id })
      setResult({
        ok: h.ok,
        text: h.ok
          ? `Reachable in ${formatLatency(h.latencyMs ?? 0)}`
          : `Not reachable: ${h.message ?? 'no answer'}`,
      })
    })
  return (
    <div className="stack wizard-test">
      <div className="row">
        <Button onClick={() => void check()} disabled={action.busy}>
          {action.busy ? 'Checking…' : 'Check voice server'}
        </Button>
      </div>
      {result && <TestResult ok={result.ok}>{result.text}</TestResult>}
    </div>
  )
}

/** Synthesize one short line and play it, so the user hears the voice before using it. */
function SpeakTest({ provider }: { provider: ProviderViewT }) {
  const [result, setResult] = useState<{ ok: boolean; text: string; src?: string } | null>(null)
  const action = useAction()
  useEffect(() => {
    const src = result?.src
    return () => {
      if (src) URL.revokeObjectURL(src)
    }
  }, [result?.src])
  const speak = () =>
    action.run(async () => {
      const r = await call('providers:test-speech', { id: provider.id })
      setResult(
        r.ok && r.dataUrl
          ? {
              ok: true,
              text: `Spoke ${r.durationSec?.toFixed(1) ?? '?'} s of audio in ${formatLatency(r.latencyMs)}`,
              src: dataUrlToBlobUrl(r.dataUrl),
            }
          : { ok: false, text: `Speech test failed: ${r.error ?? 'no audio returned'}` },
      )
    })
  return (
    <div className="stack wizard-test">
      <div className="row">
        <Button onClick={() => void speak()} disabled={action.busy}>
          {action.busy ? 'Speaking…' : 'Speak a test line'}
        </Button>
      </div>
      {result && <TestResult ok={result.ok}>{result.text}</TestResult>}
      {result?.src && (
        <audio className="wizard-audio" controls autoPlay src={result.src} aria-label="Test line" />
      )}
    </div>
  )
}

export function VoiceSection(props: {
  provider?: ProviderViewT | undefined
  enabled: boolean
  onEnabledChange: (on: boolean) => void
}) {
  const p = props.provider
  return (
    <div className="card stack">
      <h3>Voice (text to speech)</h3>
      <p className="muted">
        Speaks radio calls, voicemails and PA announcements. A local server such as mlx-audio keeps
        audio generation on this computer.
      </p>
      {p ? (
        <>
          <p>
            Connected: <strong>{p.label}</strong> <span className="mono muted">{p.baseUrl}</span>
          </p>
          <VoiceModel provider={p} />
          <CheckVoice provider={p} />
          <SpeakTest provider={p} />
          <label className="wizard-check">
            <input
              type="checkbox"
              checked={props.enabled}
              onChange={(e) => props.onEnabledChange(e.target.checked)}
            />
            Use {p.label} for audio
          </label>
        </>
      ) : (
        <ConnectForm />
      )}
    </div>
  )
}
