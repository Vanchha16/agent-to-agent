// Shapes returned by GET /api/state (see scripts/task-panel/core.mjs).
export type TaskState = 'draft' | 'malformed' | 'superseded' | 'published' | 'working' | 'report' | 'blocked'

export interface Task {
  id: string
  title: string
  state: TaskState
  updatedAt: number
  problems?: string[]
  legacy?: boolean
  sourcePrompt?: string
  reportPath?: string
  progressPath?: string
  promptText?: string
  draftText?: string
  draftHash?: string
  canSend?: boolean
  sendBlockedReason?: string
  reportText?: string
  reportStatus?: string
  outcome?: 'completed' | 'partial' | 'blocked' | null
  hasQuestions?: boolean
  progressText?: string
  supersededBy?: string
}

export interface PanelState {
  tasks: Task[]
  active: string[]
  version: string
  project?: string
}
