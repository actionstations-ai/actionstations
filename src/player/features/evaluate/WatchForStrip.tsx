import { useEffect, useRef, useState } from 'react'
import type { WatchForEntry } from './assignment'
import { EVAL } from './strings'

/**
 * The tasks an inject should trigger, shown after it is released (FR-4). A polite live region
 * announces each release once; the list stays until the tasks are rated or the entry dismissed.
 */
export function WatchForStrip({
  entries,
  onDismiss,
  onJump,
}: {
  entries: readonly WatchForEntry[]
  onDismiss: (rowId: string) => void
  /** Move to a task's card. */
  onJump: (taskId: string) => void
}) {
  const [announcement, setAnnouncement] = useState('')
  const announced = useRef<Set<string> | null>(null)

  useEffect(() => {
    // Entries present on first render (a reload, a catch-up) are not announced.
    if (announced.current === null) {
      announced.current = new Set(entries.map((e) => e.row.releaseId))
      return
    }
    const fresh = entries.find((e) => !announced.current!.has(e.row.releaseId))
    for (const e of entries) announced.current.add(e.row.releaseId)
    if (fresh) setAnnouncement(EVAL.announce(fresh.row.rowId, fresh.row.time, fresh.tasks.length))
  }, [entries])

  return (
    <div>
      {/* Always in the page, so the first release is announced too. */}
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
      {entries.length > 0 ? (
        <section className="watchfor" aria-labelledby="watchfor-heading">
          <h2 id="watchfor-heading" className="h3">
            {EVAL.watchFor}
          </h2>
          {entries.map(({ row, tasks }) => (
            <div key={row.releaseId} className="watchfor__entry">
              <div className="watchfor__head">
                <p className="watchfor__line">
                  {EVAL.watchLine(row.rowId, row.time, tasks.length)}
                </p>
                <button
                  type="button"
                  className="btn btn--quiet btn--small"
                  aria-label={EVAL.dismiss(row.rowId)}
                  onClick={() => onDismiss(row.rowId)}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
              <ul className="watchfor__tasks">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="btn btn--quiet btn--small watchfor__task"
                      onClick={() => onJump(t.id)}
                    >
                      <span className="mono">{t.criterionId ? t.rowIds[0] : t.id}</span> {t.task}
                      <span className="sr-only"> — {EVAL.rate}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}
