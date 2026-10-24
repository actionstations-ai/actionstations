// What the Packs screen is reviewing, and the pack download in flight (#268). A store rather
// than component state so an .aspack opened from Finder, dropped on the window, or a download
// started before navigating away still lands on the review when the screen shows.
import { create } from 'zustand'
import type { PackInspectRequest } from '@shared/ipc'
import type { PackInstallSource } from '@shared/schemas/pack'

export interface PackDownload {
  jobId: string
  /** What to record as the pack's source once the archive is staged. */
  source: PackInstallSource
  /** Shown while downloading ("Freight Rail 1.2.0", or the URL). */
  label: string
}

interface ReviewState {
  request: PackInspectRequest | null
  download: PackDownload | null
  review: (request: PackInspectRequest) => void
  closeReview: () => void
  startDownload: (d: PackDownload) => void
  endDownload: () => void
}

export const usePackReview = create<ReviewState>((set) => ({
  request: null,
  download: null,
  review: (request) => set({ request }),
  closeReview: () => set({ request: null }),
  startDownload: (download) => set({ download }),
  endDownload: () => set({ download: null }),
}))

/** Review a file on disk (Install from file, drag and drop, file association). */
export const reviewFile = (filePath: string): void => usePackReview.getState().review({ filePath })
