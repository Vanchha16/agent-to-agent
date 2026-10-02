// Pure mapping from real task data to what the studio shows. No invented activity: every line
// is derived from a task file's state (draft, published, progress receipt, report).
import type { Task } from './types.ts'

export type Tone = 'idle' | 'ready' | 'waiting' | 'working' | 'report' | 'attention'

export interface DeskView {
  tone: Tone
  status: string
  task: Task | null
}

export interface StudioView {
  headline: string
  owner: { line: string; pending: number }
  codex: DeskView
  claude: DeskView
  focus: Task | null
}

export type Filter = 'all' | 'needs-you' | 'with-claude' | 'done'

const newest = (list: Task[]): Task | null => list.reduce<Task | null>((best, task) => (!best || task.updatedAt > best.updatedAt ? task : best), null)
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export const needsDecision = (task: Task) => task.state === 'blocked' || (task.state === 'report' && Boolean(task.hasQuestions))

export function deriveStudio(tasks: Task[]): StudioView {
  const drafts = tasks.filter(task => task.state === 'draft')
  const malformed = tasks.filter(task => task.state === 'malformed')
  const working = tasks.filter(task => task.state === 'working')
  const published = tasks.filter(task => task.state === 'published')
  const reports = tasks.filter(task => task.state === 'report' || task.state === 'blocked')

  const draft = newest(drafts)
  const active = newest(working) ?? newest(published)
  const lastReport = newest(reports)

  const codex: DeskView = draft
    ? { tone: 'ready', status: 'Plan ready for your review', task: draft }
    : malformed.length
      ? { tone: 'attention', status: 'A plan needs fixing before it can be sent', task: newest(malformed) }
      : { tone: 'idle', status: 'No plan waiting right now', task: null }

  let claude: DeskView
  if (active?.state === 'working') claude = { tone: 'working', status: 'Acknowledged · working', task: active }
  else if (active) claude = { tone: 'waiting', status: 'Sent · not yet acknowledged', task: active }
  else if (lastReport && needsDecision(lastReport)) claude = { tone: 'attention', status: 'Latest report needs your decision', task: lastReport }
  else if (lastReport) claude = { tone: 'report', status: 'No active task · last report received', task: lastReport }
  else claude = { tone: 'idle', status: 'No active task', task: null }

  let headline: string
  if (draft) headline = 'A plan is waiting for your approval.'
  else if (active?.state === 'working') headline = 'Claude is building your approved task.'
  else if (active) headline = 'Sent to Claude — waiting for receipt.'
  else if (lastReport && needsDecision(lastReport)) headline = 'Claude’s latest report needs your decision.'
  else headline = 'All clear. Nothing needs your approval.'

  return {
    headline,
    owner: {
      pending: drafts.length,
      line: drafts.length ? `${plural(drafts.length, 'plan', 'plans')} waiting for your approval` : 'Nothing waiting for your approval',
    },
    codex,
    claude,
    focus: draft ?? active ?? lastReport ?? newest(malformed) ?? null,
  }
}

export function matchesFilter(task: Task, filter: Filter): boolean {
  switch (filter) {
    case 'needs-you': return task.state === 'draft' || task.state === 'malformed' || needsDecision(task)
    case 'with-claude': return task.state === 'published' || task.state === 'working'
    case 'done': return task.state === 'report' || task.state === 'blocked' || task.state === 'superseded'
    default: return true
  }
}

export interface Stage { owner: string; label: string; status: 'done' | 'now' | 'todo' | 'attention' }

// Codex drafts -> You approve -> Claude confirms receipt -> Claude reports.
export function stagesFor(task: Task): Stage[] | null {
  const reached = ({ draft: 0, published: 1, working: 2, report: 3, blocked: 3 } as Record<string, number | undefined>)[task.state]
  if (reached === undefined) return null
  const nowLabel: Record<string, string> = { draft: 'Awaiting your approval', published: 'Waiting for receipt', working: 'Working on report' }
  const base: Array<[string, string]> = [['Codex', 'Plan drafted'], ['You', 'Approved'], ['Claude', 'Receipt confirmed'], ['Claude', 'Report']]
  return base.map(([owner, label], index) => {
    if (index === 3 && reached === 3) {
      const attention = needsDecision(task)
      return { owner, label: task.state === 'blocked' ? 'Blocked — your decision' : attention ? 'Received · has questions' : 'Received', status: attention ? 'attention' : 'done' }
    }
    if (index <= reached) return { owner, label, status: 'done' }
    if (index === reached + 1) return { owner, label: nowLabel[task.state] ?? label, status: 'now' }
    return { owner, label, status: 'todo' }
  })
}

export const STATE_LABEL: Record<Task['state'], string> = {
  draft: 'Awaiting your approval',
  malformed: 'Plan needs fixing',
  superseded: 'Superseded',
  published: 'Sent · not yet acknowledged',
  working: 'Acknowledged · working',
  report: 'Report received',
  blocked: 'Blocked · needs your decision',
}

export const byNewest = (tasks: Task[]): Task[] => [...tasks].sort((a, b) => b.updatedAt - a.updatedAt)

// Board columns. Every task state maps to exactly one column, so a task never appears twice.
export type Column = 'needs-you' | 'with-claude' | 'reports' | 'archived'

export const COLUMNS: ReadonlyArray<{ id: Column; label: string; hint: string; empty: string }> = [
  { id: 'needs-you', label: 'Needs you', hint: 'Plans to review, plans to fix, and reports with questions or blockers', empty: 'Nothing needs you. New plans from Codex and reports with questions land here.' },
  { id: 'with-claude', label: 'With Claude', hint: 'Sent tasks, before and after Claude confirms receipt', empty: 'Claude has no active task. A plan moves here once you send it.' },
  { id: 'reports', label: 'Reports', hint: 'Reports without open questions — go over them with Codex', empty: 'No reports yet. Claude’s reports appear here when they arrive.' },
  { id: 'archived', label: 'Archived', hint: 'Plans replaced by newer ones; they can never be sent', empty: 'No superseded plans.' },
]

export function boardColumn(task: Task): Column {
  switch (task.state) {
    case 'draft':
    case 'malformed':
    case 'blocked':
      return 'needs-you'
    case 'report':
      return task.hasQuestions ? 'needs-you' : 'reports'
    case 'published':
    case 'working':
      return 'with-claude'
    case 'superseded':
      return 'archived'
  }
}

export function groupBoard(tasks: Task[]): Record<Column, Task[]> {
  const groups: Record<Column, Task[]> = { 'needs-you': [], 'with-claude': [], reports: [], archived: [] }
  for (const task of byNewest(tasks)) groups[boardColumn(task)].push(task)
  return groups
}

// Who acts next on a task, derived from its file state only.
export function nextStep(task: Task): { who: 'You' | 'Codex' | 'Claude' | null; what: string } {
  switch (task.state) {
    case 'draft': return { who: 'You', what: 'Review and approve' }
    case 'malformed': return { who: 'Codex', what: 'Fix the plan' }
    case 'published': return { who: 'Claude', what: 'Confirm receipt' }
    case 'working': return { who: 'Claude', what: 'Finish and report' }
    case 'report': return { who: 'You', what: task.hasQuestions ? 'Answer questions with Codex' : 'Go over the report with Codex' }
    case 'blocked': return { who: 'You', what: 'Decide on the blocker' }
    case 'superseded': return { who: null, what: 'No action — replaced' }
  }
}
