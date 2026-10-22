// Row selection for bulk actions: checkbox toggles, shift-click ranges, whole phases.
import { useCallback, useMemo, useRef, useState } from 'react'
import { keyRange, type Draft } from './model'

export function useSelection(draft: Draft) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const anchor = useRef<string | null>(null)
  // Rows deleted since they were picked drop out of the selection.
  const selected = useMemo(() => {
    const present = new Set(draft.rows.map((r) => r.key))
    return new Set([...picked].filter((k) => present.has(k)))
  }, [picked, draft.rows])

  const toggle = useCallback(
    (key: string, range: boolean) => {
      const from = range ? anchor.current : null
      setPicked((prev) => {
        const next = new Set(prev)
        if (from) {
          for (const k of keyRange(draft, from, key)) next.add(k)
        } else if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      anchor.current = key
    },
    [draft],
  )

  const togglePhase = useCallback(
    (phaseId: string) => {
      const keys = draft.rows.filter((r) => r.row.phaseId === phaseId).map((r) => r.key)
      setPicked((prev) => {
        const all = keys.every((k) => prev.has(k))
        const next = new Set(prev)
        for (const k of keys) {
          if (all) next.delete(k)
          else next.add(k)
        }
        return next
      })
    },
    [draft],
  )

  const clear = useCallback(() => setPicked(new Set()), [])
  return { selected, toggle, togglePhase, clear }
}
