import { useState } from 'react'
import { ArrowUpRight, Check, CircleAlert, Circle, CircleDot } from 'lucide-react'
import { STATE_LABEL, matchesFilter, needsDecision, stagesFor, type Filter } from '../lib/derive.ts'
import { ago } from '../lib/hooks.ts'
import type { Task } from '../lib/types.ts'

const TONE: Record<Task['state'], string> = {
  draft: 'tone-ready', malformed: 'tone-attention', superseded: '', published: 'tone-waiting', working: 'tone-working', report: 'tone-report', blocked: 'tone-attention',
}

export function StateBadge({ task }: { task: Task }) {
  return (
    <span className={`${TONE[task.state]} inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2 py-0.5 text-[12px] font-medium text-ink-2`}>
      <span className="dot" />{STATE_LABEL[task.state]}
    </span>
  )
}

export function explain(task: Task): string {
  switch (task.state) {
    case 'draft': return task.canSend ? 'Codex’s plan is ready. Review it in full, then send it to Claude or keep it as a draft.' : 'This plan is ready, but it can’t be sent yet.'
    case 'malformed': return 'This plan is missing required details, so it can’t be sent. Ask Codex to fix it — it updates here automatically.'
    case 'superseded': return 'This plan was replaced by a newer one and can never be sent.'
    case 'published': return 'Sent. Claude hasn’t confirmed receiving it yet.'
    case 'working': return 'Claude confirmed receipt and is working on it. The report will appear here.'
    case 'report': return task.hasQuestions ? 'Claude’s report is in and includes questions. Go over it with Codex.' : 'Claude’s report is in. A report is Claude’s account of the work — go over it with Codex.'
    case 'blocked': return 'Claude stopped and needs a decision from you. Discuss the questions with Codex.'
  }
}

export function Stages({ task, compact = false }: { task: Task; compact?: boolean }) {
  const stages = stagesFor(task)
  if (!stages) return null
  return (
    <ol className={compact ? 'm-0 list-none space-y-2.5 p-0' : 'm-0 grid list-none grid-cols-2 gap-x-3 gap-y-3 p-0 sm:grid-cols-4'} aria-label="Workflow">
      {stages.map((stage, index) => {
        const Icon = stage.status === 'done' ? Check : stage.status === 'attention' ? CircleAlert : stage.status === 'now' ? CircleDot : Circle
        const color = stage.status === 'done' ? 'text-ok' : stage.status === 'attention' ? 'text-warn' : stage.status === 'now' ? 'text-ink' : 'text-sub'
        return compact ? (
          <li key={index} className="flex items-center gap-2.5 text-[13.5px]" aria-current={stage.status === 'now' ? 'step' : undefined}>
            <Icon size={16} className={`shrink-0 ${color}`} aria-hidden="true" />
            <span className={stage.status === 'todo' ? 'text-sub' : 'text-ink'}>
              {stage.label} <span className="text-[12px] text-sub">· {stage.owner}</span>
            </span>
          </li>
        ) : (
          <li key={index} aria-current={stage.status === 'now' ? 'step' : undefined}
            className={`border-t-[3px] pt-2 text-[12.5px] ${stage.status === 'done' ? 'border-ink-2' : stage.status === 'now' ? 'border-info' : stage.status === 'attention' ? 'border-warn' : 'border-line'}`}>
            <span className="block text-[10.5px] font-semibold uppercase tracking-[.07em] text-sub">{stage.owner}</span>
            <span className={stage.status === 'todo' ? 'text-sub' : 'font-medium text-ink'}>{stage.label}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function FocusBrief({ task, onOpen }: { task: Task | null; onOpen: (task: Task) => void }) {
  if (!task) {
    return (
      <section aria-label="On your desk">
        <span className="eyebrow">On your desk</span>
        <p className="mb-0 mt-2 font-display text-[17px] font-medium">Nothing yet</p>
        <p className="mt-1 text-[13.5px] text-sub">When Codex saves a plan in prompt/drafts/, it lands here for your approval.</p>
      </section>
    )
  }
  return (
    <section aria-label="On your desk">
      <span className="eyebrow">On your desk</span>
      <p className="mb-2 mt-2 font-display text-[17px] font-medium leading-snug">{task.title}</p>
      <StateBadge task={task} />
      <p className="mb-0 mt-3 text-[13.5px] text-sub">{explain(task)}</p>
      <div className="my-5 h-px bg-line" />
      <span className="eyebrow">{task.state === 'draft' ? 'Your decision' : 'Progress'}</span>
      <div className="mt-3"><Stages task={task} compact /></div>
      <button type="button" onClick={() => onOpen(task)}
        className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-4 text-[13.5px] font-medium transition-colors hover:bg-soft">
        {task.state === 'draft' ? 'Review full plan' : task.reportText ? 'Read the report' : 'Open details'} <ArrowUpRight size={15} aria-hidden="true" />
      </button>
    </section>
  )
}

const FILTERS: Array<[Filter, string]> = [['all', 'All'], ['needs-you', 'Needs you'], ['with-claude', 'With Claude'], ['done', 'Done']]

export function History({ tasks, now, fresh, onOpen }: { tasks: Task[]; now: number; fresh: Set<string>; onOpen: (task: Task) => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [expanded, setExpanded] = useState(false)
  const shown = tasks.filter(task => matchesFilter(task, filter))
  const visible = expanded ? shown : shown.slice(0, 6)
  return (
    <section aria-label="Project history">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Project history</span>
        <span className="text-[12px] text-sub">{tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter tasks">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setExpanded(false) }}
            className={`min-h-8 rounded-full border px-3 text-[12.5px] transition-colors ${filter === value ? 'border-action bg-action text-action-ink' : 'border-line bg-surface text-ink-2 hover:bg-soft'}`}>
            {label}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="mt-3 text-[13px] text-sub">{filter === 'needs-you' ? 'Nothing needs you right now.' : filter === 'with-claude' ? 'No active task with Claude.' : 'No tasks here yet.'}</p>
      ) : (
        <ul className="m-0 mt-2 list-none p-0">
          {visible.map(task => (
            <li key={task.id}>
              <button type="button" onClick={() => onOpen(task)} data-task-id={task.id}
                className={`${TONE[task.state]} group -mx-2 flex min-h-12 w-[calc(100%+1rem)] items-start gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-soft`}>
                <span className="dot mt-[7px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{task.title}</span>
                  <span className="block text-[12px] text-sub">
                    {STATE_LABEL[task.state]}{needsDecision(task) && task.state === 'report' ? ' · questions' : ''} · {ago(task.updatedAt, now)}
                  </span>
                </span>
                {fresh.has(task.id) ? <span className="mt-0.5 rounded-full bg-action px-1.5 py-px text-[10.5px] font-semibold text-action-ink">New</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 6 ? (
        <button type="button" onClick={() => setExpanded(value => !value)} className="mt-1 min-h-9 text-[13px] font-medium text-ink-2 underline decoration-line-strong underline-offset-4 hover:decoration-current">
          {expanded ? 'Show fewer' : `Show all ${shown.length}`}
        </button>
      ) : null}
    </section>
  )
}
