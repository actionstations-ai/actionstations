// Whether this launch already counted a showing of the update question (#442), kept outside the
// card so visiting Projects again in the same launch neither counts twice nor hides the card.
import { create } from 'zustand'

/** Launches that show the question; matches MAX_ASKS in src/main/updates/check.ts. */
export const MAX_ASKS_SHOWN = 3

export const useAskedThisLaunch = create<{ asked: boolean; mark: () => void }>((set) => ({
  asked: false,
  mark: () => set({ asked: true }),
}))

/** Tests only. */
export function resetAskedThisLaunch(): void {
  useAskedThisLaunch.setState({ asked: false })
}
