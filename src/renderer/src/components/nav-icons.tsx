import {
  BookOpen,
  Clapperboard,
  FileStack,
  FileText,
  FolderOpen,
  LayoutList,
  MessageSquareText,
  Presentation,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

export const NAV_ICONS: Record<string, LucideIcon> = {
  folder: FolderOpen,
  documents: FileStack,
  scenarios: LayoutList,
  generate: Sparkles,
  prompts: MessageSquareText,
  settings: Settings,
  injects: Clapperboard,
  docs: FileText,
  facilitate: Presentation,
  library: BookOpen,
}
