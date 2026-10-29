// The presentation window (#45): one inject's media, full-bleed on black, for the players'
// screen. No app chrome, no tags; the inject title only when ?title=1. Esc (handled by main)
// closes the window.
import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { Pause, Play, Volume2 } from 'lucide-react'
import { mediaUrl } from '@shared/media-url'
import type { MediaAsset } from '@shared/schemas/media'
import { call, subscribe } from '../../lib/api'
import { useIpcQuery } from '../../lib/query'
import { fromProjectKey } from '../../state/project'
import { presentAsset } from '../facilitate/delivery'
import './present.css'
import { ClocksOnScreen } from './ClocksOnScreen'
import { injectAlt } from '../../lib/inject-alt'

function AudioCard({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }
  return (
    <div className="present__audio">
      <Volume2 className="present__speaker" size={160} aria-hidden />
      <button
        type="button"
        className="present__play"
        onClick={toggle}
        aria-label={playing ? 'Pause audio' : 'Play audio'}
      >
        {playing ? <Pause size={56} aria-hidden /> : <Play size={56} aria-hidden />}
      </button>
      <audio
        ref={ref}
        src={src}
        autoPlay
        controls
        className="present__audio-bar"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
    </div>
  )
}

function Media(props: { projectPath: string; asset: MediaAsset; alt: string }) {
  const { projectPath, asset } = props
  const src = mediaUrl(projectPath, asset.path)
  if (asset.kind === 'image') return <img className="present__image" src={src} alt={props.alt} />
  if (asset.kind === 'video')
    return <video className="present__video" src={src} controls autoPlay aria-label={props.alt} />
  if (asset.kind === 'audio') return <AudioCard src={src} />
  return null
}

/** "This discussion is being recorded" while a hot wash recording runs (#425 FR-6). */
function useRecordingNotice(): boolean {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let live = true
    call('hotwash:recording-status')
      .then((s) => live && setShow(s.recording && s.notice))
      .catch(() => undefined)
    const off = subscribe('hotwash:recording', (e) => setShow(e.recording && e.notice))
    return () => {
      live = false
      off()
    }
  }, [])
  return show
}

export default function PresentPage() {
  const params = useParams()
  const [search] = useSearchParams()
  const projectPath = fromProjectKey(params.projectKey ?? '')
  const req = {
    projectPath,
    scenarioId: params.scenarioId ?? '',
    injectId: params.injectId ?? '',
  }
  const inject = useIpcQuery('injects:get', req)
  const asset = presentAsset(inject.data, search.get('asset'))
  const cache = search.get('cache')
  const showTitle = search.get('title') === '1'
  const recordingNotice = useRecordingNotice()

  useEffect(() => {
    document.title = 'Presentation'
    // Main closes the window on Esc before the page sees it; this covers focus edge cases.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') void call('facilitator:close-present')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="present" data-testid="present">
      {cache && (
        <img
          key={cache}
          className="present__image"
          src={mediaUrl(projectPath, cache)}
          alt={injectAlt(inject.data)}
        />
      )}
      {!cache && asset && (
        <Media
          key={asset.id}
          projectPath={projectPath}
          asset={asset}
          alt={injectAlt(inject.data)}
        />
      )}
      {inject.data && !asset && !cache && (
        <p className="present__empty">No media for this inject.</p>
      )}
      {inject.isError && <p className="present__empty">Could not load this inject.</p>}
      {showTitle && inject.data && <p className="present__title">{inject.data.title}</p>}
      <ClocksOnScreen projectPath={projectPath} scenarioId={req.scenarioId} />
      {recordingNotice && (
        <p className="present__recording" role="status">
          <span className="present__recording-dot" aria-hidden /> This discussion is being recorded
        </p>
      )}
    </div>
  )
}
