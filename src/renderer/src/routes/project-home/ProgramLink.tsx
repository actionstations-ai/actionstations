// Where the project stands with the exercise program (#424): linked or not, and the way in.
// The program is optional; a project without one works exactly as before.
import { Link } from 'react-router'
import type { Project } from '@shared/schemas'

export function ProgramLink({ project }: { project: Project }) {
  return (
    <section className="card" aria-labelledby="proj-program-title">
      <h2 id="proj-program-title">Exercise program</h2>
      {project.program ? (
        <p>
          This project is linked to an exercise program, so its corrective actions and plan sections
          count toward the program's schedule. <Link to="/program">Open program</Link>
        </p>
      ) : (
        <p className="muted">
          Not linked to a program. A program tracks corrective actions across exercises and plans
          the next ones. <Link to="/program">Link to a program</Link>
        </p>
      )}
    </section>
  )
}
