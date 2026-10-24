// /packs/export: the Export as pack wizard as a page. `?project=<path>` preselects a project;
// otherwise the open project, if any.
import { useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '../../components/ui'
import { useProjectUi } from '../../state/project'
import { PackExportWizard } from './PackExportWizard'

export default function PackExportPage() {
  const [params] = useSearchParams()
  const open = useProjectUi((s) => s.projectPath)
  const navigate = useNavigate()
  return (
    <div className="page">
      <PageHeader
        eyebrow="Packs"
        title="Export as pack"
        description="Build an .aspack from your own templates, prompts, workflows and a project, check it like an install would, and share it."
      />
      <PackExportWizard
        projectPath={params.get('project') ?? open}
        onClose={() => void navigate(-1)}
      />
    </div>
  )
}
