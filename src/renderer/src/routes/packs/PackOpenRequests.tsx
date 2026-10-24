// .aspack files handed to the app (#268): a double-clicked pack (macOS open-file, or a launch
// argument on Windows and Linux) and a pack dropped anywhere on the window. Each one opens the
// review on the Packs screen; nothing is installed until the user presses Install there.
import { useEffect, useEffectEvent } from 'react'
import { useNavigate } from 'react-router'
import { call, pathForFile, subscribe } from '../../lib/api'
import { reviewFile } from './review-store'
import { isPackFile } from './pack-format'

/** The first .aspack among dropped files, as an absolute path. */
function droppedPack(e: DragEvent): string | undefined {
  for (const file of Array.from(e.dataTransfer?.files ?? [])) {
    const path = pathForFile(file)
    if (path && isPackFile(path)) return path
  }
  return undefined
}

export function PackOpenRequests() {
  const navigate = useNavigate()
  const open = useEffectEvent((path: string) => {
    reviewFile(path)
    void navigate('/packs')
  })
  useEffect(() => {
    const off = subscribe('app:open-pack', ({ path }) => open(path))
    void call('app:pending-pack-opens').then((paths) => {
      // Several at once: the last one is reviewed.
      const last = paths.at(-1)
      if (last) open(last)
    })
    // A drop only fires where dragover was cancelled; files may be dragged onto any screen.
    const onDragOver = (e: DragEvent) => {
      if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault()
    }
    // Capture phase, so a pack dropped on a screen with its own drop target (Documents) opens
    // the review here; that screen ignores .aspack files.
    const onDrop = (e: DragEvent) => {
      const path = droppedPack(e)
      if (!path) return
      e.preventDefault()
      open(path)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop, true)
    return () => {
      off()
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [])
  return null
}
