import { useRef } from 'react'
import { DropdownMenu } from 'radix-ui'
import { MoreHorizontal } from 'lucide-react'
import type { RecentProject } from '@shared/schemas'
import { Badge, Button } from '../../components/ui'
import { revealLabel } from './reveal'

export type CardAction = 'open' | 'duplicate' | 'archive' | 'unarchive' | 'forget' | 'reveal'

const formatOpened = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function CardMenu(props: {
  project: RecentProject
  onAction: (action: CardAction, trigger: HTMLElement | null) => void
}) {
  const { project } = props
  const triggerRef = useRef<HTMLButtonElement>(null)
  const item = (action: CardAction, label: string, danger = false) => (
    <DropdownMenu.Item
      className={danger ? 'menu__item menu__item--danger' : 'menu__item'}
      onSelect={() => props.onAction(action, triggerRef.current)}
    >
      {label}
    </DropdownMenu.Item>
  )
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className="btn btn--ghost btn--icon"
          aria-label={`More actions for ${project.name}`}
        >
          <MoreHorizontal size={18} aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align="end" sideOffset={4}>
          {item('open', 'Open')}
          {item('duplicate', 'Duplicate…')}
          {item('reveal', revealLabel())}
          <DropdownMenu.Separator className="menu__separator" />
          {project.archived ? item('unarchive', 'Unarchive') : item('archive', 'Archive')}
          {item('forget', 'Remove from recent', true)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function ProjectCard(props: {
  project: RecentProject
  onAction: (action: CardAction, trigger: HTMLElement | null) => void
}) {
  const { project } = props
  const headingId = `project-${encodeURIComponent(project.path)}`
  return (
    <li className="card project-card" aria-labelledby={headingId}>
      <div className="project-card__top">
        <div className="project-card__title">
          <h2 id={headingId}>{project.name}</h2>
          {project.archived && <Badge tone="warn">Archived</Badge>}
        </div>
        <CardMenu project={project} onAction={props.onAction} />
      </div>
      {project.orgName && <p>{project.orgName}</p>}
      {/* RTL box + LTR text: long paths keep their tail (the folder name) visible. */}
      <p className="project-card__path mono muted" title={project.path}>
        <span dir="ltr">{project.path}</span>
      </p>
      <div className="project-card__footer">
        <span className="muted">Opened {formatOpened(project.openedAt)}</span>
        <Button
          size="sm"
          variant="primary"
          aria-label={`Open ${project.name}`}
          onClick={() => props.onAction('open', null)}
        >
          Open
        </Button>
      </div>
    </li>
  )
}
