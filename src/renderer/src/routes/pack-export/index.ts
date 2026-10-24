import { lazy } from 'react'
import type { RouteDef } from '../types'

// No nav entry: the Packs screen (#268) links here ("Export as pack"), or mounts
// PackExportDialog / PackExportWizard from ./PackExportDialog and ./PackExportWizard.
const PackExportPage = lazy(() => import('./PackExportPage'))

export const PACK_EXPORT_PATH = '/packs/export'

export const routes: RouteDef[] = [{ path: PACK_EXPORT_PATH, component: PackExportPage }]
