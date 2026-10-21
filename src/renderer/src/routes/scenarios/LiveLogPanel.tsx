import { useEffect, useRef } from 'react'
import { Badge, ProgressBar } from '../../components/ui'
import { isActive, type LiveLog, type LogStream } from './live-log'
import { itemLabel, stageLabel } from './stages'

const STATUS_TONE = {
  queued: 'neutral',
  running: 'info',
  paused: 'warn',
  done: 'ok',
  error: 'error',
  cancelled: 'warn',
} as const

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

function StreamView({
  stream,
  open,
  labels,
}: {
  stream: LogStream
  open: boolean
  labels?: Record<string, string>
}) {
  const pre = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight
  }, [stream.text])
  const title =
    stageLabel(stream.stage) + (stream.itemId ? ` · ${itemLabel(stream.itemId, labels)}` : '')
  return (
    <details className="live-log__stream" open={open}>
      <summary>
        {title} <span className="muted">({stream.text.length.toLocaleString()} chars)</span>
      </summary>
      <pre ref={pre} className="live-log__text" aria-label={`Model output for ${title}`}>
        {stream.text}
      </pre>
    </details>
  )
}

export function LiveLogPanel({
  log,
  itemLabels,
}: {
  log: LiveLog
  itemLabels?: Record<string, string>
}) {
  if (!log.jobId) {
    return (
      <section className="card live-log" aria-label="Generation log">
        <h2 className="section-title">Generation log</h2>
        <p className="muted">No generation is running for this scenario.</p>
      </section>
    )
  }
  const active = isActive(log)
  const last = log.streams.at(-1)?.key
  return (
    <section className="card live-log" aria-label="Generation log">
      <div className="row live-log__head">
        <h2 className="section-title">Generation log</h2>
        {log.status && <Badge tone={STATUS_TONE[log.status]}>{log.status}</Badge>}
      </div>
      {active && <ProgressBar value={log.progress} label="Generation progress" />}
      <p className="live-log__message" aria-live="polite">
        {log.message}
      </p>
      {log.entries.length > 0 && (
        <ol className="live-log__entries" aria-label="Log entries">
          {log.entries.map((e, i) => (
            <li key={i} className={`live-log__entry live-log__entry--${e.level}`}>
              <span className="mono muted">{time(e.at)}</span>
              {e.stage && <span className="live-log__stage">{stageLabel(e.stage)}</span>}
              <span>{e.message}</span>
            </li>
          ))}
        </ol>
      )}
      {log.streams.map((s) => (
        <StreamView
          key={s.key}
          stream={s}
          open={active ? s.key === last : false}
          {...(itemLabels ? { labels: itemLabels } : {})}
        />
      ))}
    </section>
  )
}
