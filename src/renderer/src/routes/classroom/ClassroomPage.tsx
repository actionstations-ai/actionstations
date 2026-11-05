// Classroom (#686, spec 0453): run any exercise as a class session. Student records stay in this
// project folder (ADR-0090). Later sections (outcomes, rubrics, scoring, dashboard) join below.
import { PageHeader } from '../../components/ui'
import { CoursePanel } from './CoursePanel'
import { ModeCard } from './ModeCard'
import { OutcomesPanel } from './OutcomesPanel'
import { RotationPanel } from './RotationPanel'
import { RosterPanel } from './RosterPanel'
import { RubricsPanel } from './RubricsPanel'
import { ScoringPanel } from './ScoringPanel'
import { useClassroom } from './use-classroom'
import './classroom.css'

export default function ClassroomPage() {
  const { projectPath, state } = useClassroom()
  const data = state.data
  return (
    <div className="page classroom-page">
      <PageHeader
        eyebrow="Teach"
        title="Classroom"
        description="Map exercise objectives to course outcomes, score students with rubrics, and export grades. Student records stay on this computer."
      />
      {data && <ModeCard projectPath={projectPath} state={data} />}
      {data?.enabled && (
        <>
          <CoursePanel key={data.course.updatedAt} projectPath={projectPath} state={data} />
          <RosterPanel projectPath={projectPath} state={data} />
          <OutcomesPanel
            key={`o-${data.course.outcomes.length}`}
            projectPath={projectPath}
            state={data}
          />
          <RubricsPanel projectPath={projectPath} state={data} />
          <RotationPanel projectPath={projectPath} state={data} />
          <ScoringPanel projectPath={projectPath} state={data} />
        </>
      )}
    </div>
  )
}
