import { useRef, useState } from 'react'
import type { RecentProject } from '@shared/schemas'
import { Button, EmptyState, PageHeader } from '../../components/ui'
import { toast } from '../../components/toast-store'
import { call } from '../../lib/api'
import { queryClient, useIpcQuery } from '../../lib/query'
import { useProjectUi } from '../../state/project'
import { DuplicateDialog } from './DuplicateDialog'
import { NewProjectDialog } from './NewProjectDialog'
import { ProjectCard, type CardAction } from './ProjectCard'
import { revealFolder } from './reveal'
import { useOpenProject } from './use-open-project'
import './projects.css'

const refreshRecent = () => queryClient.invalidateQueries({ queryKey: ['project:list-recent'] })

/** Archive/unarchive/forget/reveal: the card actions that stay on this page. */
function useCardCommands() {
  const projectPath = useProjectUi((s) => s.projectPath)
  const setProjectPath = useProjectUi((s) => s.setProjectPath)
  const archive = async (p: RecentProject, archived: boolean) => {
    try {
      await call('project:archive', { path: p.path, archived })
      toast.success(archived ? `Archived ${p.name}` : `Restored ${p.name}`)
    } catch (err) {
      toast.error('Could not change archive state', err)
    }
    await refreshRecent()
  }
  const forget = async (p: RecentProject) => {
    await call('project:forget-recent', { path: p.path })
    if (projectPath === p.path) setProjectPath(null)
    toast.info(`Removed ${p.name} from recent projects`, 'The folder on disk was not changed.')
    await refreshRecent()
  }
  return { archive, forget, reveal: (p: RecentProject) => revealFolder(p.path) }
}

function ProjectList(props: {
  label: string
  projects: RecentProject[]
  onAction: (p: RecentProject, a: CardAction, trigger: HTMLElement | null) => void
}) {
  if (props.projects.length === 0) return null
  return (
    <section className="stack" aria-label={props.label}>
      <h2 className="project-list__heading">{props.label}</h2>
      <ul className="grid-cards project-list">
        {props.projects.map((p) => (
          <ProjectCard key={p.path} project={p} onAction={(a, t) => props.onAction(p, a, t)} />
        ))}
      </ul>
    </section>
  )
}

export default function ProjectsPage() {
  const recent = useIpcQuery('project:list-recent', undefined)
  const projects = recent.data ?? []
  const [creating, setCreating] = useState(false)
  const [duplicating, setDuplicating] = useState<RecentProject | null>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const opener = useOpenProject()
  const commands = useCardCommands()

  const onAction = (p: RecentProject, action: CardAction, trigger: HTMLElement | null) => {
    returnFocus.current = trigger
    if (action === 'open') void opener.open(p.path)
    if (action === 'duplicate') setDuplicating(p)
    if (action === 'archive' || action === 'unarchive')
      void commands.archive(p, action === 'archive')
    if (action === 'forget') void commands.forget(p)
    if (action === 'reveal') void commands.reveal(p)
  }
  const closeDuplicate = () => {
    setDuplicating(null)
    // The menu that opened the dialog is gone; put focus back on its trigger.
    setTimeout(() => returnFocus.current?.focus(), 0)
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Workspace"
        title="Projects"
        description="A project holds one organization's plans and the exercises built from them. Projects are folders on disk you can copy, back up, or put under version control."
        actions={
          <>
            <Button disabled={recent.isError} onClick={() => void opener.pickAndOpen()}>
              Open folder…
            </Button>
            <Button variant="primary" disabled={recent.isError} onClick={() => setCreating(true)}>
              New project
            </Button>
          </>
        }
      />
      {recent.isSuccess && projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          body="Create a project, then import the plans, policies, maps and forms your exercises should cite — for example an Airport Emergency Plan and a Terminal Incident Response Plan."
        />
      ) : (
        <>
          <ProjectList
            label="Recent projects"
            projects={projects.filter((p) => !p.archived)}
            onAction={onAction}
          />
          <ProjectList
            label="Archived"
            projects={projects.filter((p) => p.archived)}
            onAction={onAction}
          />
        </>
      )}
      <NewProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(p) => {
          setCreating(false)
          toast.success(`Created ${p.project.name}`)
          opener.enter(p)
        }}
      />
      <DuplicateDialog
        source={duplicating}
        onClose={closeDuplicate}
        onDone={(p) => {
          setDuplicating(null)
          toast.success(`Created ${p.project.name}`)
          opener.enter(p)
        }}
      />
    </div>
  )
}
