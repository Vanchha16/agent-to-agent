import { forwardRef } from 'react'
import { LayoutTemplate, Monitor, Moon, Orbit, Sun } from 'lucide-react'
import type { ApiError } from '../lib/api.ts'
import { STATE_LABEL, type StudioView } from '../lib/derive.ts'
import type { ThemeChoice } from '../lib/hooks.ts'
import type { PanelState, Task } from '../lib/types.ts'

export type BindRef = (element: HTMLElement | null) => void

// Everything a template needs. Fetching, approval, lifecycle tracking, fresh-report badges, and the
// single details drawer all live above the template in App, so switching templates only swaps this view.
export interface Workspace {
  state: PanelState | null
  error: ApiError | null
  tasks: Task[]
  view: StudioView
  now: number
  fresh: Set<string>
  theme: 'light' | 'dark'
  reduce: boolean
  delivery: string
  primary: string | null
  open: (task: Task) => void
  // Lifecycle animation targets: each template attaches these to its visible owner/agent elements.
  bind: { owner: BindRef; codex: BindRef; claude: BindRef; delivery: BindRef }
}

export const DELIVERY_IDLE = 'Plan → your approval → build → report'

export function openLabel(task: Task): string {
  if (task.state === 'draft') return 'Review plan'
  if (task.reportText) return 'Read report'
  if (task.state === 'malformed' || task.state === 'superseded') return 'Open plan'
  return 'View task'
}

// Attention labels shared by every template so the wording never drifts between layouts.
export function attentionLabels(task: Task, fresh: Set<string>): string[] {
  const labels: string[] = []
  if (fresh.has(task.id)) labels.push('New')
  if (task.state === 'blocked') labels.push('Blocked')
  else if (task.state === 'report' && task.hasQuestions) labels.push('Questions')
  if (task.state === 'malformed') labels.push('Needs fixing')
  if (task.state === 'draft' && task.canSend === false) labels.push('Can’t send yet')
  return labels
}

// For text lines that already print the state label: drop labels that would only repeat it.
export function extraLabels(task: Task, fresh: Set<string>): string[] {
  const state = STATE_LABEL[task.state].toLowerCase()
  return attentionLabels(task, fresh).filter(label => !state.includes(label.toLowerCase()))
}

// Local date and time from a task file's modification time, for the Terminal template.
export function stamp(ms: number): string {
  if (!ms) return '—'
  const d = new Date(ms)
  const two = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`
}

export function LoadState({ ws, className = '' }: { ws: Workspace; className?: string }) {
  const expired = ws.error?.code === 'token'
  return (
    <div className={`grid min-h-[280px] place-items-center px-4 text-center text-[14px] text-sub ${className}`}>
      {expired ? (
        <p className="max-w-sm">This page session expired. Reload the page to see your tasks again.</p>
      ) : ws.error ? (
        <p className="max-w-sm">Couldn’t load tasks. Start the panel with <code className="md-code">npm.cmd run panel:start</code>, then reload this page.</p>
      ) : (
        <p>Reading plans and reports from the project folder…</p>
      )}
    </div>
  )
}

// Shown in every template when tasks are on screen but the latest check failed.
export function ConnectionBanner({ error, hasState }: { error: ApiError | null; hasState: boolean }) {
  if (!error || !hasState) return null
  return (
    <div role="alert" className="mx-5 mt-4 rounded-lg border border-line border-l-[3px] border-l-bad bg-bad-soft px-4 py-2.5 text-[13.5px] text-ink sm:mx-8">
      {error.code === 'token'
        ? 'This page session expired. Showing the last loaded files — reload the page before reviewing or sending.'
        : 'The panel server isn’t answering. Showing the last loaded files; changes won’t appear until it’s running again.'}
    </div>
  )
}

const THEMES: Array<[ThemeChoice, string, typeof Sun]> = [['system', 'System', Monitor], ['light', 'Light', Sun], ['dark', 'Dark', Moon]]

interface TopBarProps {
  project: string
  live: string
  error: boolean
  templateName: string
  galleryOpen: boolean
  onTemplates: () => void
  choice: ThemeChoice
  onTheme: (choice: ThemeChoice) => void
}

export const TopBar = forwardRef<HTMLButtonElement, TopBarProps>(function TopBar({ project, live, error, templateName, galleryOpen, onTemplates, choice, onTheme }, ref) {
  return (
    <header className="topbar flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 border-b border-line px-5 py-3.5 sm:px-8">
      <div className="flex min-w-0 items-center gap-2.5 font-semibold">
        <Orbit size={19} strokeWidth={1.8} aria-hidden="true" />
        <span className="topbar-brand">Studio</span>
        <span className="hidden truncate font-normal text-sub sm:inline">/ {project}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5">
        <p className={`m-0 flex items-center gap-2 text-[12.5px] ${error ? 'text-bad' : 'text-sub'}`} role="status">
          <span className={`dot ${error ? '' : 'tone-report'}`} />{live}
        </p>
        <button ref={ref} type="button" onClick={onTemplates} aria-haspopup="dialog" aria-expanded={galleryOpen}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] font-medium text-ink transition-colors hover:bg-soft">
          <LayoutTemplate size={15} strokeWidth={1.8} aria-hidden="true" />
          Templates
          <span className="rounded-md bg-soft px-1.5 py-px text-[11.5px] font-semibold text-ink-2">{templateName}</span>
        </button>
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="radiogroup" aria-label="Appearance">
          {THEMES.map(([value, label, Icon]) => (
            <button key={value} type="button" role="radio" aria-checked={choice === value} aria-label={label} title={label} onClick={() => onTheme(value)}
              className={`grid size-8 place-items-center rounded-md transition-colors ${choice === value ? 'bg-soft text-ink' : 'text-sub hover:text-ink'}`}>
              <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
    </header>
  )
})
