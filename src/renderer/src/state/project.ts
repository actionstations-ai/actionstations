import { create } from 'zustand'

/** The currently open project (by folder path). Server state comes from IPC queries. */
interface ProjectUiState {
  projectPath: string | null
  setProjectPath: (p: string | null) => void
}

export const useProjectUi = create<ProjectUiState>((set) => ({
  projectPath: null,
  setProjectPath: (projectPath) => set({ projectPath }),
}))

/** Route param encoding for project paths. */
export const projectKey = (path: string): string => encodeURIComponent(path)
export const fromProjectKey = (key: string): string => decodeURIComponent(key)
