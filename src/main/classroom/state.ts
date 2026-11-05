// What the Classroom screen reads: the setting, the notice and the course file.
import { CLASSROOM_NOTICE } from '@shared/schemas'
import type { ClassroomState } from '@shared/ipc/classroom'
import { requireProject } from '../project/guard'
import { loadProject } from '../project/store'
import { readCourse, requireClassroom } from './store'

export async function classroomState(root: string): Promise<ClassroomState> {
  const project = await loadProject(root)
  return {
    enabled: project.classroom?.enabled === true,
    noticeAcceptedAt: project.classroom?.noticeAcceptedAt,
    notice: CLASSROOM_NOTICE,
    course: await readCourse(root),
  }
}

/** The project root for a handler that needs Classroom mode on. */
export async function classroomRoot(projectPath: string): Promise<string> {
  const root = await requireProject(projectPath)
  await requireClassroom(root)
  return root
}
