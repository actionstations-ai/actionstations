// "Test render": run one sample through the workflow and preview the result inline.
import { useEffect, useMemo, useState } from 'react'
import type { WorkflowEntry } from '@shared/ipc'
import { Button, Field } from '../../components/ui'
import { useIpcMutation } from '../../lib/query'
import { dataUrlToObjectUrl } from './workflow-utils'
import { errorText } from '../../lib/errors'

const EXPECTED: Record<WorkflowEntry['mediaType'], string> = {
  image: 'about 20 s for SDXL on Apple Silicon',
  video: 'about 30 s with LTX-Video; animates the last test image',
  audio: 'a few seconds',
}

function Preview(props: { mimeType: string; dataUrl: string }) {
  const isVideo = props.mimeType.startsWith('video/')
  const videoUrl = useMemo(
    () => (isVideo ? dataUrlToObjectUrl(props.dataUrl) : undefined),
    [isVideo, props.dataUrl],
  )
  useEffect(() => () => (videoUrl ? URL.revokeObjectURL(videoUrl) : undefined), [videoUrl])
  if (props.mimeType.startsWith('image/'))
    return <img className="wf-preview" src={props.dataUrl} alt="Test render output" />
  if (isVideo)
    return videoUrl ? (
      <video className="wf-preview" src={videoUrl} controls loop aria-label="Test render output" />
    ) : null
  return <p className="muted">Rendered {props.mimeType}.</p>
}

export function TestRender(props: { workflow: WorkflowEntry; providerId: string | undefined }) {
  const [prompt, setPrompt] = useState('')
  const render = useIpcMutation('comfy:test-render')
  const run = () => {
    if (!props.providerId) return
    render.mutate({
      providerId: props.providerId,
      workflowId: props.workflow.id,
      ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
    })
  }
  return (
    <section className="card stack" aria-labelledby="test-render-heading">
      <h2 id="test-render-heading">Test render</h2>
      <Field
        label="Prompt"
        hint={`Leave empty for a sample airport scene. Takes ${EXPECTED[props.workflow.mediaType]}.`}
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            aria-describedby={describedBy}
            className="textarea"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        )}
      </Field>
      <div className="row">
        <Button variant="primary" disabled={!props.providerId || render.isPending} onClick={run}>
          {render.isPending ? 'Rendering…' : 'Test render'}
        </Button>
        {!props.providerId && <span className="muted">Add a ComfyUI provider first.</span>}
      </div>
      {render.isPending && (
        <p role="status" className="muted">
          ComfyUI is rendering…
        </p>
      )}
      {render.isError && (
        <p className="field__error" role="alert">
          {errorText(render.error)}
        </p>
      )}
      {render.data && (
        <figure className="stack wf-figure">
          <Preview mimeType={render.data.mimeType} dataUrl={render.data.dataUrl} />
          <figcaption className="muted">
            {(render.data.elapsedMs / 1000).toFixed(1)} s · seed {render.data.seed ?? 'n/a'}
          </figcaption>
        </figure>
      )}
    </section>
  )
}
