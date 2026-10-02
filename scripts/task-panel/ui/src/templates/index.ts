import type { ComponentType } from 'react'
import type { Workspace } from '../components/Shell.tsx'
import type { TemplateId } from '../lib/templates.ts'
import { BoardTemplate } from './BoardTemplate.tsx'
import { CyberTemplate } from './CyberTemplate.tsx'
import { DashboardTemplate } from './DashboardTemplate.tsx'
import { MinimalTemplate } from './MinimalTemplate.tsx'
import { StudioTemplate } from './StudioTemplate.tsx'
import { TerminalTemplate } from './TerminalTemplate.tsx'

export const LAYOUTS: Record<TemplateId, ComponentType<{ ws: Workspace }>> = {
  studio: StudioTemplate,
  dashboard: DashboardTemplate,
  board: BoardTemplate,
  terminal: TerminalTemplate,
  minimal: MinimalTemplate,
  cyber: CyberTemplate,
}
