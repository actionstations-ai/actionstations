import { useEffect, useRef, useState } from 'react'
import { pathForFile } from '../../lib/api'

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

/**
 * Window-wide file drop target. Returns whether files are being dragged over the window.
 * Dropped files are resolved to absolute paths through the preload bridge.
 */
export function useFileDrop(onPaths: (paths: string[]) => void, enabled = true): boolean {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const cb = useRef(onPaths)
  useEffect(() => {
    cb.current = onPaths
  }, [onPaths])

  useEffect(() => {
    if (!enabled) return
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current += 1
      setOver(true)
    }
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setOver(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const paths = Array.from(e.dataTransfer?.files ?? [])
        .map((f) => pathForFile(f))
        // .aspack packs open the pack review instead (packs/PackOpenRequests, #268).
        .filter((p) => p && !/\.aspack$/i.test(p))
      if (paths.length) cb.current(paths)
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [enabled])

  return over
}
