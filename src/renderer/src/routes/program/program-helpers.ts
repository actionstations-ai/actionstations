// Small factories and actions shared by the Program screens (kept out of the component files so
// those export only components).
import type { PlannedExercise, ProgramAction } from '@shared/schemas'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { refreshProgramQueries } from '../../state/program'

export function newAction(programId: string): ProgramAction {
  const now = new Date().toISOString()
  return {
    formatVersion: 1,
    id: crypto.randomUUID(),
    programId,
    title: '',
    description: '',
    areaForImprovement: '',
    coreCapabilities: [],
    planSections: [],
    owner: { name: '', organization: '', email: '' },
    priority: 'medium',
    status: 'open',
    history: [],
    source: { kind: 'manual' },
    verifications: [],
    redlineIds: [],
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}

export const newExercise = (year: number, quarter: number): PlannedExercise => ({
  id: crypto.randomUUID(),
  title: '',
  type: 'tabletop',
  when: { year, quarter },
  status: 'planned',
  priorityIds: [],
  coreCapabilities: [],
  planSections: [],
  correctiveActionIds: [],
  notes: '',
})

export async function openProgramAt(path: string): Promise<boolean> {
  try {
    await call('program:open', { programPath: path })
    await refreshProgramQueries()
    return true
  } catch (e) {
    toast.error('Could not open the program', e)
    return false
  }
}

/** The one-click CSV of the improvement plan (FR-7): choose a folder, get the file. */
export async function exportCsvNow(programPath: string): Promise<void> {
  const outDir = await call('dialog:open-directory', { title: 'Where should the CSV go?' })
  if (!outDir) return
  try {
    const { files } = await call('program:export', { programPath, outDir, targets: ['ip_csv'] })
    toast.success('CSV written', files[0])
  } catch (e) {
    toast.error('Could not write the CSV', e)
  }
}
