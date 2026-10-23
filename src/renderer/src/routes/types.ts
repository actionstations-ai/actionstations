import type { ComponentType, LazyExoticComponent } from 'react'

export interface RouteDef {
  /** react-router path, e.g. "/projects" or "/p/:projectKey/documents". */
  path: string
  component: LazyExoticComponent<ComponentType> | ComponentType
  nav?: {
    label: string
    /** "global" shows always; "project" shows only when a project is open. */
    scope: 'global' | 'project'
    order: number
    /** lucide-react icon name (looked up in components/nav-icons). */
    icon?: string
    /** Project nav only: "advanced" items sit in a collapsible group below the build steps. */
    group?: 'build' | 'advanced'
  }
}
