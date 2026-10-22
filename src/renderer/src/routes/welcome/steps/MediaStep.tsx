// Step 3 (optional): ComfyUI for images/video and a local voice server for audio.
import { useState } from 'react'
import { StepLayout, type StepNav } from '../StepLayout'
import { saveGlobalRouting, useAction, useProviders } from '../use-setup'
import { isTtsProvider, mediaAssignments } from '../wizard-state'
import { ComfySection } from './ComfySection'
import { VoiceSection } from './VoiceSection'

export function MediaStep({ onBack, onNext }: StepNav) {
  const providers = useProviders()
  const list = providers.data ?? []
  const comfy = list.find((p) => p.kind === 'comfyui')
  const voice = list.find(isTtsProvider)
  const [useComfy, setUseComfy] = useState(true)
  const [useVoice, setUseVoice] = useState(true)
  const save = useAction()
  const assignments = mediaAssignments(comfy, voice, { comfy: useComfy, voice: useVoice })
  const next = async () => {
    if (await save.run(() => saveGlobalRouting(assignments))) onNext()
  }
  return (
    <StepLayout
      title="Media (optional)"
      intro={
        <p>
          Add local image, video and voice generation. Without them, injects still render from
          templates and you can attach your own media.
        </p>
      }
      {...(onBack ? { onBack } : {})}
      onNext={() => void next()}
      busy={save.busy}
      nextLabel={assignments.length ? 'Save and continue' : 'Skip media'}
    >
      <ComfySection providers={list} enabled={useComfy} onEnabledChange={setUseComfy} />
      <VoiceSection provider={voice} enabled={useVoice} onEnabledChange={setUseVoice} />
      {save.error && (
        <p className="field__error" role="alert">
          {save.error}
        </p>
      )}
    </StepLayout>
  )
}
